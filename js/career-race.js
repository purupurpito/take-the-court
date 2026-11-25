/* TAKE THE COURT — js/career-race.js (owner: premios)
 * «Carrera por los premios» (VB.CareerRace), como en EA FC y NBA 2K: durante la temporada, clasificación en directo de cada premio
 * individual con candidatos inventados de tu liga (y tu rival personal si juega en ella), tendencia por jornada (↑2, ↓1, =), tu puesto
 * y lo que te falta para subir; corte de mitad de temporada (mensaje, «Favorito» y unos pocos seguidores) y, al final, la «Gala de
 * premios» en el fin de temporada.
 *
 * NO DUPLICA los premios de career-life.js (AWARDS + seasonAwards): siguen saliendo de allí, sin tocar nada. La carrera está montada
 * para que su 1r al final sea justo quien gana el premio: el rival que encabeza cada clasificación acaba exactamente con el umbral que
 * pide hoy el premio (needOf replica las fórmulas de AWARDS con la MISMA tirada: rng(hash(seed, 'awards', season)) en el mismo orden).
 * Tú quedas 1r ⇔ tu cifra ≥ umbral (el mismo «≥» del test; en empate ganas tú). Las condiciones de siempre (≥ 6 partidos, más de la
 * mitad jugados por ti y, para el MVP, tu club 1r o 2º) te dejan «fuera de concurso» aunque tus números den.
 * Premios nuevos (se dan aquí, en 'season', después de career-life): «Mejor joven» (≤ 23 años, cada temporada), «Mejor receptor» y
 * «Mejor opuesto» (solo pista, por puesto). «Mejor líbero» sale en la gala pero solo lo ganan rivales (el líbero no se puede llevar).
 *
 * Datos sin DOM (se carga en node con vm: tools/racetest.js). Estado en c.race con ensure(c) idempotente y sin tiradas (no sube VER ni
 * VER6; una partida vieja sin c.race carga igual). Azar solo por hash de la semilla. No toca el partido, sim.js ni g.rng.
 * Se engancha con los registros comunes (CONTRACT.md «Extensiones de la Carrera»): VB.CareerExt (hook, caseAwards, _demo) y
 * VB.CareerUIExt (sub-pestaña Liga › Premios, tarjeta en Partido, Gala en el fin de temporada, punto de aviso, acciones 'rc-' y CSS).
 * Mensajes con la clave 'race' (rótulo «Premios» en la bandeja).
 *
 * c.race = { v: 1, s, lg, rvn, pool: [{n, k, a, p, q, rv?}], cur, prev: {s, lg, w, open, me: {cat: {v, r}}, rk: {cat: [índices]}},
 *   mid: {s, w, r: {cat: puesto}, fav: [cats]} | null, ann: {s, best: {cat: mejor puesto avisado}},
 *   gala: {s, lg, it: [{id, me, n, club, v, r, why, g?, pos?}]} | null, hist: [{s, r: {cat: puesto}, w: [ids]}] (tope 12), seen }
 */
(function (root) {
  'use strict';
  var VB = root.VB = root.VB || {};

  // ------------------------------------------------------------------ utilidades
  function isH(c) { return !!(c && c.mode === 'hall'); }
  // Motor de la carrera c. CONTRACT: VB.Career.ext.engine(c); pero el motor de pista solo redefine lo suyo (sin avgNota, _rng, _msg,
  // club…), así que, como career-life.js K(c), la pista va en una vista «pista sobre playa» (las claves de HALL encima de las de BEACH).
  var HV = null, HVsrc = null;
  function E(c) {
    var C = VB.Career; if (!C) return null;
    var B = C.beach || C;
    if (!isH(c) || !C.hall) return B;
    if (HVsrc !== C.hall) { HVsrc = C.hall; HV = {}; var k; for (k in B) HV[k] = B[k]; for (k in C.hall) HV[k] = C.hall[k]; }
    return HV;
  }
  function CL() { return VB.CareerLife || null; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function round1(v) { return Math.round(v * 10) / 10; }
  /** Cifra con coma decimal y un decimal: 3,1. */
  function f1(v) { return (Math.round((+v || 0) * 10) / 10).toFixed(1).replace('.', ','); }
  /** Ordinal corto (estilo de Ferran): 1r, 2º, 3r, 4º… Nunca «1.er». */
  function ord(n) { n = n | 0; return n + (n === 1 || n === 3 ? 'r' : 'º'); }
  function escH(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function rngOf() { var a = Array.prototype.slice.call(arguments), C = VB.Career && (VB.Career.beach || VB.Career); return C._rng(C._hash.apply(null, a)); }
  function pick(r, a) { return a[Math.floor(r() * a.length) % a.length]; }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function myClub(c) { var e = E(c); return c && c.myClub >= 0 && e ? e.myClub(c) : null; }
  function clubOf(c, id) { var e = E(c); try { return e && id != null && id >= 0 ? e.club(c, id) : null; } catch (x) { return null; } }
  /** Nivel 0-4 de tu liga (el de career-life: x.L de los premios). */
  function lvl(c) {
    var L = CL(); if (L && L.lvlOf) return L.lvlOf(c);
    var k = myClub(c); if (!k) return 0;
    if (isH(c)) { var g = E(c).league(k.lid, c); return clamp(Math.round((((g && g.strength) || 50) - 50) / 10), 0, 4); }
    return clamp(k.lvl | 0, 0, 4);
  }
  /** Pista: los recuentos crecen con los puntos del set (career-life ptsF; 1 en la playa). */
  function ptsF(c) { var L = CL(); return L && L.ptsF ? L.ptsF(c) : isH(c) ? clamp((+c.points || 15) / 15, 1, 25 / 15) : 1; }
  function leagueOf(c) { var k = myClub(c), e = E(c); if (!k) return null; return isH(c) ? e.league(k.lid, c) || (c.leagues && c.leagues[0]) : e.league(k.lvl); }
  /** «de la Hiperliga de Playa» / «del Circuito Nacional» (como career-life deL). */
  function deL(L) { return L ? (L.art === 'el' ? 'del ' : 'de la ') + L.name : 'de la liga'; }
  function role6(c) { var H = VB.Career && VB.Career.hall; return H && H.ctrlRole ? H.ctrlRole(c) : (c.player && c.player.roleKey) || 'OH'; }
  /** Jornadas de liga (rondas, con descansos) y la de la mitad. */
  function weeksW(c) { var k = myClub(c), e = E(c); if (!k || !e) return 14; return isH(c) ? (e.weeksOf ? e.weeksOf(c, k.lid) : 11) || 11 : e.WEEKS || 14; }
  function midW(c) { var e = E(c); if (!e) return 7; return isH(c) ? (e.midWeek ? e.midWeek(c) : Math.floor(weeksW(c) / 2)) : e.MID_WEEK || 7; }
  /** Progreso de la liga 0..1: con la liga acabada (copa, eliminatorias o verano), 1 (los rivales ya tienen su cifra final). */
  function progress(c) { if (!c || c.phase === 'pick') return 0; if (c.phase !== 'league') return 1; var W = weeksW(c); return W > 0 ? clamp((c.week | 0) / W, 0, 1) : 0; }
  function LVM(L) { return [1, 2, 4, 8, 15][clamp(L | 0, 0, 4)]; }   // (copia de career-life LV_MULT: seguidores por nivel de liga)

  // ------------------------------------------------------------------ categorías
  // kind 'nota' (media de nota) o 'cnt' (recuento por partido). modes: 'both' | 'hall'. aw = nombre del premio (el de career-life
  // para los que ya existen); name = rótulo en la carrera («Mejor saque» es el premio «Mejor sacador»).
  var CATS = {
    mvp: { id: 'mvp', name: 'MVP', aw: 'MVP', short: 'MVP', unit: 'Nota media', kind: 'nota', modes: 'both', old: 1 },
    young: { id: 'young', name: 'Mejor joven', aw: 'Mejor joven', short: 'Joven', unit: 'Nota media, solo menores de 24', kind: 'nota', modes: 'both' },
    pts: { id: 'pts', name: 'Máximo anotador', aw: 'Máximo anotador', short: 'Anotador', unit: 'Puntos por partido', kind: 'cnt', noun: ['punto', 'puntos'], modes: 'both', old: 1 },
    ace: { id: 'ace', name: 'Mejor saque', aw: 'Mejor sacador', short: 'Saque', unit: 'Aces por partido', kind: 'cnt', noun: ['ace', 'aces'], modes: 'both', old: 1 },
    rec: { id: 'rec', name: 'Mejor receptor', aw: 'Mejor receptor', short: 'Receptor', unit: 'Remates + ½ defensas por partido', kind: 'cnt', noun: ['remate', 'remates'], modes: 'hall' },
    opp: { id: 'opp', name: 'Mejor opuesto', aw: 'Mejor opuesto', short: 'Opuesto', unit: 'Puntos − errores por partido', kind: 'cnt', noun: ['punto', 'puntos'], modes: 'hall' },
    blk: { id: 'blk', name: 'Muro del año', aw: 'Muro del año', short: 'Muro', unit: 'Bloqueos por partido', kind: 'cnt', noun: ['bloqueo', 'bloqueos'], modes: 'both', old: 1 },
    set: { id: 'set', name: 'Mejor colocador', aw: 'Mejor colocador', short: 'Colocador', unit: 'Asistencias por partido', kind: 'cnt', noun: ['asistencia', 'asistencias'], modes: 'hall', old: 1 },
    dig: { id: 'dig', name: 'Mejor defensa', aw: 'Mejor defensa', short: 'Defensa', unit: 'Defensas por partido', kind: 'cnt', noun: ['defensa', 'defensas'], modes: 'both', old: 1 },
    lib: { id: 'lib', name: 'Mejor líbero', aw: 'Mejor líbero', short: 'Líbero', unit: 'Defensas por partido', kind: 'cnt', noun: ['defensa', 'defensas'], modes: 'hall', rivals: 1 }
  };
  var ORDER_B = ['mvp', 'young', 'pts', 'ace', 'blk', 'dig'];
  var ORDER_H = ['mvp', 'young', 'pts', 'ace', 'rec', 'opp', 'blk', 'set', 'dig', 'lib'];
  function catsOf(c) { return isH(c) ? ORDER_H : ORDER_B; }
  /** Premios nuevos para la vitrina (career-world.js trophyCase los añade al grupo «Premios» con caseAwards). */
  var AWARDS = [
    { id: 'young', name: 'Mejor joven', need: 'Cada temporada, con 23 años o menos' },
    { id: 'rec', name: 'Mejor receptor', only: 'hall', need: 'Juega de receptor y gana la gala' },
    { id: 'opp', name: 'Mejor opuesto', only: 'hall', need: 'Juega de opuesto y gana la gala' }
  ];
  var YOUNG_MAX = 23;
  // Umbrales de los premios nuevos (calibrar con racetest §11: una temporada buena jugándolo todo gana su premio de puesto 1 de cada
  // 2 o 3 veces, como dice el comentario de AWARDS en career-life sobre CH6). need = (b + u·U + l·L) × f (f solo en los de pista).
  // Medidas de partida (career-life.js, comentario de CH6: autopilot ≈ jugador bueno, por partido a 15, L0-L4): receptor remates +
  // ½ defensas ≈ 9,4/8,3/11,6/9,2/5,9; opuesto puntos − errores ≈ 5,2/5,9/6,2/5,1/4,1; nota 7,4-8,1 en L0-L2 (años de «joven»).
  var RACE_CAL = {
    young: { b: 7.5, u: 0.6, l: -0.1, f: 0 },
    rec: { b: 8.3, u: 2.5, l: 0, f: 1 },
    opp: { b: 4.8, u: 2, l: 0, f: 1 },
    lib: { b: 9, u: 3, l: 0, f: 1 }
  };
  /** Tu carrera de puesto: pista OH→rec, OPP→opp, MB→blk, S→set; playa bloqueador→blk, defensor y universal→dig. */
  function posCat(c) {
    if (isH(c)) return { OH: 'rec', OPP: 'opp', MB: 'blk', S: 'set' }[role6(c)] || 'rec';
    return c.player && c.player.roleKey === 'atk' ? 'blk' : 'dig';
  }
  function ageOf(c) { return (c && c.player && c.player.age) | 0; }
  /** Tus cuatro carreras (la de joven solo con 23 años o menos). */
  function mine(c) { if (!c) return []; var o = ['mvp']; if (ageOf(c) <= YOUNG_MAX) o.push('young'); var p = posCat(c); o.push(p); if (p !== 'ace') o.push('ace'); return o; }
  /** Las demás del modo (las «Otras carreras»). */
  function others(c) { var m = ['mvp', 'young', posCat(c), 'ace']; return catsOf(c).filter(function (k) { return m.indexOf(k) < 0; }); }
  /** ¿Entras tú en esta clasificación? (líbero nunca; receptor/opuesto solo si es tu puesto; joven solo con ≤ 23). */
  function meIn(c, id) {
    if (id === 'lib') return false;
    if (id === 'young') return ageOf(c) <= YOUNG_MAX;
    if (id === 'rec' || id === 'opp') return isH(c) && posCat(c) === id;
    if (id === 'set') return isH(c);
    return true;
  }

  // ------------------------------------------------------------------ cifras y umbrales
  function statsOf(c) { return (c && c.stats) || {}; }
  /** Tu cifra en la categoría (las mismas cuentas que career-life seasonAwards: S.pts / n y (S[k] | 0) / n). null sin nota. */
  function val(c, id) {
    var S = statsOf(c), n = Math.max(1, S.played | 0);
    switch (id) {
      case 'mvp': case 'young': return E(c).avgNota(c);
      case 'pts': return S.pts / n;
      case 'ace': return (S.aces | 0) / n;
      case 'blk': return (S.blocks | 0) / n;
      case 'dig': return (S.digs | 0) / n;
      case 'set': return (S.assists | 0) / n;
      case 'rec': return ((S.kills | 0) + 0.5 * (S.digs | 0)) / n;
      case 'opp': return ((S.pts | 0) - (S.errors | 0)) / n;
    }
    return null;
  }
  /** Total de la temporada en la unidad de «lo que necesitas» (rec: remates, con ½ de las defensas; opp: puntos − errores). */
  function totOf(c, id) {
    var S = statsOf(c);
    return { pts: +S.pts || 0, ace: S.aces | 0, blk: S.blocks | 0, dig: S.digs | 0, set: S.assists | 0, rec: (S.kills | 0) + 0.5 * (S.digs | 0), opp: (S.pts | 0) - (S.errors | 0) }[id] || 0;
  }
  /** Umbral de un premio con la tirada u, el nivel L y el factor de puntos f (h = pista). ESPEJO de career-life.js AWARDS (test/h):
   *  si cambia una fórmula allí, cámbiala aquí (racetest §2 lo vigila). */
  function needF(id, u, L, f, h) {
    switch (id) {
      case 'mvp': return 8 + 0.5 * u - 0.15 * L;
      case 'pts': return h ? (7 + 2 * u - 0.3 * L) * f : 18 + 4 * u - 0.5 * L;
      case 'ace': return h ? (0.7 + 0.4 * u) * f : 4 + 1.2 * u - 0.3 * L;
      case 'blk': return h ? (1 + 0.5 * u + 0.05 * L) * f : 2.4 + 1 * u + 0.1 * L;
      case 'dig': return h ? (7 + 3 * u + 0.3 * L) * f : 11 + 6 * u + 2.5 * L;
      case 'set': return (20 + 4 * u - 0.5 * L) * f;
    }
    var k = RACE_CAL[id]; if (!k) return 0;
    var b = k.b + k.u * u + k.l * L;
    return k.f ? b * f : b;
  }
  /** Umbrales de la temporada: {id: {need, u}}. Las tiradas de los premios que ya existen salen en el MISMO orden que seasonAwards
   *  (mvp —solo con nota—, pts, ace, blk, dig y, en la pista, set); otra instancia del rng con la misma semilla no mueve la suya. */
  function needs(c) {
    var L = lvl(c), f = ptsF(c), h = isH(c), o = {}, u;
    var r = rngOf(c.seed, 'awards', c.season), nota = E(c).avgNota(c);
    if (nota != null) { u = r(); o.mvp = { need: needF('mvp', u, L, f, h), u: u }; } else o.mvp = { need: needF('mvp', 0.5, L, f, h), u: null };
    ['pts', 'ace', 'blk', 'dig'].concat(h ? ['set'] : []).forEach(function (id) { u = r(); o[id] = { need: needF(id, u, L, f, h), u: u }; });
    var r2 = rngOf(c.seed, 'race-aw', c.season);
    ['young', 'rec', 'opp', 'lib'].forEach(function (id) { u = r2(); o[id] = { need: needF(id, u, L, f, h), u: u }; });
    return o;
  }
  function needOf(c, id) { var n = c && needs(c)[id]; return n ? { need: n.need, u: n.u } : null; }

  // ------------------------------------------------------------------ estado (c.race)
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function snapOk(s) { return isObj(s) && isObj(s.me) && isObj(s.rk); }
  /** Crea o repara c.race. Idempotente y sin tiradas: no genera candidatos (eso es poolOf, al vuelo). */
  function ensure(c) {
    if (!c) return null;
    var R = c.race;
    if (!isObj(R)) R = c.race = {};
    R.v = 1;
    if (!Array.isArray(R.pool)) R.pool = [];
    else if (R.pool.some(function (x) { return !isObj(x) || typeof x.n !== 'string'; })) R.pool = [];
    if (typeof R.s !== 'number' || !isFinite(R.s)) R.s = 0;
    if (typeof R.lg !== 'string') R.lg = '';
    if (typeof R.rvn !== 'string') R.rvn = '';
    if (!snapOk(R.prev)) R.prev = null;
    if (!snapOk(R.cur)) R.cur = null;
    if (!(isObj(R.mid) && typeof R.mid.s === 'number' && isObj(R.mid.r) && Array.isArray(R.mid.fav))) R.mid = null;
    if (!(isObj(R.ann) && isObj(R.ann.best))) R.ann = { s: 0, best: {} };
    if (!(isObj(R.gala) && typeof R.gala.s === 'number' && Array.isArray(R.gala.it))) R.gala = null;
    if (R.gala) R.gala.it = R.gala.it.filter(function (x) { return isObj(x) && typeof x.id === 'string'; });
    if (!Array.isArray(R.hist)) R.hist = [];
    R.hist = R.hist.filter(isObj).slice(-12);
    if (typeof R.seen !== 'string') R.seen = '';
    return R;
  }
  function lgKey(c) { var k = myClub(c); if (!k) return ''; return isH(c) ? 'h' + k.lid : 'b' + k.lvl; }
  function lgClubs(c) { var k = myClub(c), e = E(c); if (!k) return []; return isH(c) ? e.leagueClubs(c, k.lid) : e.clubsOf(c, k.lvl); }
  /** Tu rival personal si juega en tu liga (c.life.rival de career-life), o null. */
  function rivalIn(c) {
    var rv = c && c.life && c.life.rival, me = myClub(c); if (!rv || !me || typeof rv.name !== 'string') return null;
    var k = clubOf(c, rv.club); if (!k || k.id === me.id) return null;
    return (isH(c) ? k.lid === me.lid : k.lvl === me.lvl) ? rv : null;
  }
  var ROLES_H = ['OH', 'OH', 'OH', 'OH', 'OH', 'OH', 'OPP', 'OPP', 'OPP', 'OPP', 'MB', 'MB', 'MB', 'MB', 'S', 'S', 'S', 'S', 'L', 'L', 'L', 'L'];
  var ROLES_B = ['blk', 'blk', 'blk', 'blk', 'blk', 'blk', 'def', 'def', 'def', 'def', 'def', 'def'];
  function myP(c) { return isH(c) ? role6(c) : c.player && c.player.roleKey === 'atk' ? 'blk' : 'def'; }
  /** Candidatos de tu liga esta temporada (se generan al vuelo con su propia semilla y se guardan en c.race.pool). Pista 22 (6
   *  receptores, 4 opuestos, 4 centrales, 4 colocadores y 4 líberos), playa 12; los 5 primeros (sin líberos) con ≤ 23 años. */
  function poolOf(c) {
    var R = ensure(c), lg = lgKey(c), rv = rivalIn(c), rvn = rv ? rv.name : '';
    if (!lg) return [];
    if (R.pool.length && R.s === (c.season | 0) && R.lg === lg && R.rvn === rvn) return R.pool;
    var rp = rngOf(c.seed, 'race-pool', c.season | 0, lg), me = myClub(c), out = [], used = {};
    var mine0 = c.player && c.player.name || '';
    used[mine0] = 1;
    if (rv) used[rv.name] = 1;
    var roles = (isH(c) ? ROLES_H : ROLES_B).slice();
    for (var i = roles.length - 1; i > 0; i--) { var j = Math.floor(rp() * (i + 1)); var t = roles[i]; roles[i] = roles[j]; roles[j] = t; }
    var cl = lgClubs(c).filter(function (k) { return !me || k.id !== me.id; });
    if (!cl.length && me) cl = [me];
    var young = 0, e = E(c);
    roles.forEach(function (p) {
      var k = pick(rp, cl), nm = '', tries = 0;
      do { nm = isH(c) ? e._name(rp) : e._newMate(c, k, rp).name; } while (used[nm] && ++tries < 30);
      used[nm] = 1;
      var yg = p !== 'L' && young < 5;
      if (yg) young++;
      var a = yg ? 19 + Math.floor(rp() * 5) : 19 + Math.floor(rp() * 14);
      out.push({ n: nm, k: k ? k.id : -1, a: a, p: p, q: round3(rp()) });
    });
    // El rival va al final y con su propia tirada: cuando aparece (1ª jornada), el resto de candidatos y sus índices no cambian.
    if (rv) out.push({ n: rv.name, k: rv.club, a: ageOf(c), p: myP(c), q: round3(0.6 + 0.4 * rngOf(c.seed, 'race-rv', c.season | 0)()), rv: 1 });
    R.s = c.season | 0; R.lg = lg; R.rvn = rvn; R.pool = out;
    return out;
  }
  function round3(v) { return Math.round(v * 1000) / 1000; }
  /** ¿Entra el candidato x en la categoría? */
  function eligible(x, id, h) {
    var p = x.p;
    switch (id) {
      case 'mvp': case 'ace': return p !== 'L';
      case 'young': return x.a <= YOUNG_MAX && p !== 'L';
      case 'pts': return h ? p === 'OH' || p === 'OPP' || p === 'MB' : true;
      case 'blk': return h ? p === 'MB' || p === 'OPP' : p === 'blk';
      case 'dig': return h ? p === 'L' || p === 'OH' : p === 'def';
      case 'set': return p === 'S';
      case 'rec': return p === 'OH';
      case 'opp': return p === 'OPP';
      case 'lib': return p === 'L';
    }
    return false;
  }
  /** Rivales de la categoría con su cifra final F (el 1º = el umbral exacto del premio) y su curva: [{i, F, A, ph}]. */
  function catCands(c, id, need) {
    var P = poolOf(c), R = ensure(c), h = isH(c), rc = rngOf(c.seed, 'race-cat', c.season | 0, R.lg, id);
    var el = [];
    P.forEach(function (x, i) { if (eligible(x, id, h)) el.push({ i: i, s: x.q + 0.25 * rc(), rv: !!x.rv }); });
    el.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    var top = el.slice(0, 5), rvx = el.filter(function (x) { return x.rv; })[0];
    if (rvx && top.indexOf(rvx) < 0 && top.length) top[top.length - 1] = rvx;   // (tu rival siempre entra si puede)
    var nota = CATS[id].kind === 'nota', G = 1, F = need, out = [];
    top.forEach(function (x, j) {
      if (j) { if (nota) F = F - (0.15 + 0.25 * rc()); else G = G - (0.05 + 0.08 * rc()); }   // (cola separada: el 5º, a ~0,65 × umbral o ~1,1 de nota)
      out.push({ i: x.i, F: nota ? F : need * G, A: 0.06 + 0.12 * rc(), ph: 2 * Math.PI * rc() });
    });
    return out;
  }
  /** Cifra de un rival al progreso p (0..1): ruido grande al principio, exactamente F al final (p = 1). */
  function curve(x, p, nota) {
    var w = Math.sin(x.ph + 7 * p) * Math.pow(1 - p, 0.8);
    return nota ? Math.min(10, x.F + 0.9 * x.A * w) : x.F * (1 + x.A * w);
  }
  /** Motivo por el que quedas fuera de concurso: '' | 'pocos' (no llegas a 6) | 'visto' (más de la mitad simulados) | 'top2' (MVP). */
  function gateOf(c, id) {
    var S = statsOf(c), pl = S.played | 0, real = pl - (S.sim | 0);
    var left = c.phase === 'league' ? Math.max(0, weeksW(c) - (c.week | 0)) : 0;
    if (pl + left < 6) return 'pocos';
    if (pl >= 2 && real < pl * 0.5) return 'visto';
    if (id === 'mvp') {
      var k = myClub(c), started = c.phase !== 'league' || (c.week | 0) > 0;
      if (k && started && E(c).posOf(c, k.id) > 2) return 'top2';
    }
    return '';
  }

  /** Clasificación en directo de la categoría (pura: no guarda; solo genera los candidatos si faltan). */
  function standings(c, id) {
    var cat = CATS[id]; if (!c || !cat || catsOf(c).indexOf(id) < 0) return null;
    var h = isH(c), S = statsOf(c), pl = S.played | 0, R = ensure(c);
    var nd = needs(c)[id].need, p = progress(c), nota = cat.kind === 'nota', open = pl >= 2;
    var P = poolOf(c), cands = catCands(c, id, nd), rows = [];
    cands.forEach(function (x) {
      var cd = P[x.i] || {}, k = clubOf(c, cd.k);
      rows.push({ i: x.i, n: cd.n || '', club: cd.k, clubName: k ? k.name : '', a: cd.a | 0, rv: !!cd.rv, me: false, v: open ? curve(x, p, nota) : x.F, F: x.F });
    });
    rows.sort(function (a, b) { return b.v - a.v || a.i - b.i; });
    var me = null;
    if (meIn(c, id) && open) {
      var mv = val(c, id); if (mv == null) mv = 0;
      var k0 = myClub(c), at = 0;
      while (at < rows.length && rows[at].v > mv) at++;   // (en empate ganas tú, como el «≥» de career-life)
      me = { i: -1, n: c.player.name, club: k0 ? k0.id : -1, clubName: k0 ? k0.name : '', a: ageOf(c), rv: false, me: true, v: mv, gate: gateOf(c, id) };
      rows.splice(at, 0, me);
    }
    var pv = R.prev && R.prev.s === (c.season | 0) && R.prev.lg === R.lg && R.prev.open ? R.prev : null;
    rows.forEach(function (r, j) {
      r.rk = j + 1;
      if (!pv || !open) { r.d = null; return; }
      if (r.me) { var pm = pv.me[id]; r.d = pm && pm.r ? pm.r - r.rk : 'new'; return; }
      var lst = pv.rk[id], pi = Array.isArray(lst) ? lst.indexOf(r.i) : -1;
      if (pi < 0) { r.d = 'new'; return; }
      // puesto que tenía entonces entre las filas de entonces (contando tu fila si estabas)
      var meThen = pv.me[id] && pv.me[id].r ? pv.me[id].r : 0, pr = pi + 1 + (meThen && meThen <= pi + 1 ? 1 : 0);
      r.d = pr - r.rk;
    });
    var W = weeksW(c), wk = Math.min(c.week | 0, W);
    var out = { cat: id, label: cat.name, unit: cat.unit, kind: cat.kind, p: p, wk: wk, W: W, open: open, need: nd, rows: rows, me: null };
    if (me) out.me = { rk: me.rk, v: me.v, d: me.d, gate: me.gate };
    if (out.me) out.me.need = needText(c, id, out);
    return out;
  }
  function rankOf(c, id) { var s = standings(c, id); return s && s.me && s.open ? s.me.rk : 0; }
  function leaders(c, id, n) {
    var s = standings(c, id); if (!s) return [];
    return s.rows.filter(function (r) { return !r.me; }).slice(0, n || 3).map(function (r) { return { n: r.n, club: r.clubName, v: r.v }; });
  }
  /** Foto de la jornada (para las flechas de la siguiente): tu cifra y puesto, y el orden de los rivales por categoría. */
  function snap(c) {
    var R = ensure(c), o = { s: c.season | 0, lg: lgKey(c), w: c.week | 0, open: (statsOf(c).played | 0) >= 2, me: {}, rk: {} };
    poolOf(c);
    catsOf(c).forEach(function (id) {
      var st = standings(c, id); if (!st) return;
      o.rk[id] = st.rows.filter(function (r) { return !r.me; }).map(function (r) { return r.i; });
      if (st.me) o.me[id] = { v: round3(st.me.v), r: st.me.rk };
    });
    o.lg = R.lg;
    return o;
  }

  // ------------------------------------------------------------------ «lo que necesitas»
  function ceil1(v) { return Math.ceil(v * 10 - 1e-9) / 10; }
  function unitTxt(id, v) { var cat = CATS[id]; return cat.kind === 'nota' ? 'una media de ' + f1(v) : id === 'rec' || id === 'opp' ? 'una media de ' + f1(v) + ' por partido' : f1(v) + ' ' + cat.noun[1] + ' por partido'; }
  function needText(c, id, st) {
    var S = statsOf(c), pl = S.played | 0, real = pl - (S.sim | 0), cat = CATS[id];
    if (!st.open) return 'Aún no hay carrera: arranca tras la 2ª jornada.';
    if (id === 'lib') return 'El líbero no se puede llevar: esta carrera es solo de rivales.';
    if (!st.me) {
      if (id === 'young') return 'Es para menores de 24. Tú tienes ' + ageOf(c) + '.';
      if (id === 'rec') return 'Solo cuenta si juegas de receptor.';
      if (id === 'opp') return 'Solo cuenta si juegas de opuesto.';
      return '';
    }
    var me = st.me, rows = st.rows, mi = me.rk - 1;
    if (me.gate === 'pocos') return 'Con menos de 6 partidos no entras en la gala.';
    if (me.gate === 'visto') return 'Te han visto poco: has jugado ' + real + ' de ' + pl + '. Juega tú los partidos.';
    if (me.gate === 'top2') { var k = myClub(c); return 'El MVP sale del 1r o 2º de la liga. Tu club va ' + ord(k ? E(c).posOf(c, k.id) : 0) + '.'; }
    if (c.phase === 'off') return me.rk === 1 ? 'Has ganado este premio.' : 'Te quedaste a ' + f1(Math.max(0.1, rows[0].v - me.v)) + ' del 1r puesto.';
    if (me.rk === 1) {
      var ch = rows[1], gap = ch ? me.v - ch.v : 0;
      return 'Vas 1r. ' + (ch ? 'Tu perseguidor está a ' + (gap < 0.05 ? 'muy poco' : f1(gap)) + '. ' : '') + 'Mantén ' + unitTxt(id, me.v) + '.';
    }
    var tg = rows[mi - 1], vt = tg.v, nm = tg.n, late = st.p >= 0.5 || c.phase !== 'league';
    var far = c.phase !== 'league' ? 'Está lejos y queda poca temporada.' : late ? 'Está lejos. Aprieta en lo que queda.' : 'Está lejos. Sube tu media en la 2ª vuelta.';
    if (cat.kind === 'nota') {
      var notes = (c.notes || []).filter(function (x) { return x && typeof x.nota === 'number'; }), n = notes.length, sum = 0;
      notes.forEach(function (x) { sum += x.nota; });
      var x1 = ceil1(vt * (n + 1) - sum);
      if (x1 <= 10) return 'Un ' + f1(Math.max(5, x1)) + ' en el próximo partido te pone por delante de ' + nm + '.';
      var x3 = ceil1((vt * (n + 3) - sum) / 3);
      if (x3 <= 10) return 'Tres partidos seguidos con un ' + f1(x3) + ' te ponen por delante de ' + nm + '.';
      return 'Necesitas varias notas altas seguidas. ' + far;
    }
    var nn = Math.max(1, pl), tot = totOf(c, id);
    var x = Math.max(1, Math.ceil(vt * (nn + 1) - tot + 1e-9));
    if (x <= Math.max(3, Math.ceil(2 * vt))) return 'Para pasar a ' + nm + ': ' + plural(x, cat.noun[0], cat.noun[1]) + ' en el próximo partido.';
    var y = Math.max(1, Math.ceil((vt * (nn + 3) - tot) / 3 - 1e-9));
    if (y <= 3 * vt) return 'Para pasar a ' + nm + ': ' + plural(y, cat.noun[0], cat.noun[1]) + ' por partido en los 3 próximos.';
    return far;
  }

  // ------------------------------------------------------------------ ganchos (life() de career.js)
  var FLAV = {
    mvp: 'Nadie juega mejor que tú en la liga esta temporada.', young: 'De los jóvenes, nadie rinde como tú.', pts: 'Nadie anota tanto como tú.',
    ace: 'Nadie saca como tú esta temporada.', blk: 'Tu bloqueo es el muro de la liga.', dig: 'Nadie levanta tantos balones como tú.',
    set: 'Nadie reparte el juego como tú.', rec: 'Nadie recibe y remata como tú.', opp: 'Nadie anota tanto desde el lado derecho.'
  };
  /** «la carrera al MVP», «la carrera al Mejor saque»… (tu puesto, con su nombre). */
  function alName(id) { return 'al ' + CATS[id].name; }
  function msg(c, t, x) { var e = E(c); if (e && e._msg) e._msg(c, 'race', t, x); }
  function onMatch(c) {
    var R = ensure(c);
    if (!(c.myClub >= 0) || c.phase === 'pick' || c.phase === 'off') return;
    if (R.gala && R.gala.s === (c.season | 0)) return;   // (endSeason corre antes del 'match' del último partido)
    var sn = snap(c);
    R.prev = R.cur && R.cur.s === sn.s && R.cur.lg === sn.lg ? R.cur : null;
    R.cur = sn;
    if (!sn.open) return;
    var mw = midW(c);
    if (c.phase === 'league' && mw > 0 && (c.week | 0) >= mw && (c.week | 0) <= mw + 2 && !(R.mid && R.mid.s === (c.season | 0))) { midCut(c, sn); return; }
    announce(c, sn);
  }
  /** Aviso de jornada: como mucho 1, al entrar por primera vez en el podio o al pasar a 1r (prioridad: MVP, puesto, joven, saque). */
  function announce(c, sn) {
    var R = ensure(c);
    if (R.ann.s !== (c.season | 0)) R.ann = { s: c.season | 0, best: {} };
    var m = mine(c), pri = ['mvp', posCat(c), 'young', 'ace'].filter(function (k, i, a) { return m.indexOf(k) >= 0 && a.indexOf(k) === i; });
    var ev = null;
    pri.forEach(function (id) {
      var me = sn.me[id]; if (!me || !me.r) return;
      if (gateOf(c, id)) return;
      var b = R.ann.best[id] | 0;
      if (!ev && me.r === 1 && b !== 1) ev = { id: id, lead: true };
      else if (!ev && me.r <= 3 && (!b || b > 3)) ev = { id: id, r: me.r };
      if (!b || me.r < b) R.ann.best[id] = me.r;
    });
    if (!ev) return;
    if (ev.lead) msg(c, 'Lideras la carrera ' + alName(ev.id), FLAV[ev.id] + (c.phase === 'league' ? ' Mantén el ritmo hasta el final de la liga.' : ' Tus partidos de copa aún suman.'));
    else msg(c, 'Podio en la carrera ' + alName(ev.id), 'Ya estás en el podio de la carrera ' + alName(ev.id) + '. Vas ' + ord(ev.r) + '.');
  }
  /** Corte de mitad de temporada: tus puestos, «Favorito» en las que lideras (máx. 2) y +60 × nivel de liga seguidores por cada una. */
  function midCut(c, sn) {
    var R = ensure(c), m = mine(c), L = lvl(c), parts = [], fav = [], r = {};
    catsOf(c).forEach(function (id) { if (sn.me[id] && sn.me[id].r) r[id] = sn.me[id].r; });
    m.forEach(function (id) {
      var me = sn.me[id]; if (!me || !me.r) return;
      var nm = id === posCat(c) ? 'Tu puesto' : CATS[id].name, g = gateOf(c, id);
      if (me.r === 1) { parts.push(nm + ': 1r' + (g ? ', pero fuera de concurso' : '')); if (!g && fav.length < 2) fav.push(id); return; }
      var st = standings(c, id), above = st && st.rows[me.r - 2];
      parts.push(nm + ': vas ' + ord(me.r) + (above && me.r <= 3 ? ', a ' + f1(Math.max(0.1, above.v - me.v)) + ' de ' + above.n : ''));
    });
    R.mid = { s: c.season | 0, w: c.week | 0, r: r, fav: fav };
    if (R.ann.s !== (c.season | 0)) R.ann = { s: c.season | 0, best: {} };
    m.forEach(function (id) { var b = R.ann.best[id] | 0; if (sn.me[id] && sn.me[id].r && (!b || sn.me[id].r < b)) R.ann.best[id] = sn.me[id].r; });   // (el corte cuenta como aviso)
    var fans = 0, CLx = CL();
    if (CLx && CLx.addFame) fav.forEach(function () { fans += CLx.addFame(c, 60 * LVM(L)); });
    var tx = parts.join('. ') + '.';
    if (fav.length) tx += ' La prensa ya te ve como ' + (fav.length > 1 ? 'favorito en dos premios' : 'favorito') + ': +' + num(fans) + ' seguidores.';
    msg(c, 'Mitad de temporada: los premios', tx);
  }
  function num(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  /** Premios nuevos (joven, receptor, opuesto): mismas condiciones que career-life (≥ 6 partidos, más de la mitad tuyos) y cifra ≥ umbral. */
  function giveNew(c, also) {
    var CLx = CL(); if (!CLx) return [];
    var S = statsOf(c), pl = S.played | 0, real = pl - (S.sim | 0);
    if (pl < 6 || real < pl * 0.5) return [];
    var nd = needs(c), k = myClub(c), Lg = leagueOf(c), L = lvl(c), l = CLx.ensure(c), won = [];
    AWARDS.forEach(function (a) {
      if (a.only && a.only !== (isH(c) ? 'hall' : 'beach')) return;
      if (!meIn(c, a.id)) return;
      var v = val(c, a.id); if (v == null || !(v >= nd[a.id].need)) return;
      var nm = a.name + ' ' + deL(Lg);
      l.awards.push({ season: c.season, id: a.id, name: nm, club: k ? k.name : '' });
      if (!Array.isArray(c.trophies)) c.trophies = [];
      c.trophies.push({ season: c.season, kind: 'premio', name: nm, club: k ? k.name : '' });
      CLx.addFame(c, 150 * LVM(L));
      won.push(a);
    });
    if (won.length) {
      var rv = c.review || (c.review = {});
      if (!Array.isArray(rv.awards)) rv.awards = [];
      won.forEach(function (a) { rv.awards.push(a.name); });
      msg(c, won.length === 1 ? 'Premio: ' + won[0].name : plural(won.length, 'premio más', 'premios más') + ' de la gala',
        'La gala ' + deL(Lg) + (also ? ' también' : '') + ' te ha dado ' + won.map(function (a) { return '«' + a.name + '»'; }).join(' y ') + '. ' + (won.length === 1 ? 'Ya está' : 'Ya están') + ' en tu palmarés.');
      try { rv.legacy = CLx.legacyScore(c); rv.fans = Math.round(l.fame); CLx.check(c); } catch (e) { }
    }
    return won.map(function (a) { return a.id; });
  }
  /** Líneas de la gala: una por premio del modo (y Revelación si la has ganado). won = ids que has ganado tú esta temporada. */
  function buildGala(c, won) {
    var k = myClub(c), Lg = leagueOf(c), it = [], pos = k ? E(c).posOf(c, k.id) : 0;
    catsOf(c).forEach(function (id) {
      var st = standings(c, id); if (!st) return;
      var me = st.me, cat = CATS[id];
      if (won.indexOf(id) >= 0) { it.push({ id: id, me: 1, n: c.player.name, club: k ? k.name : '', v: round3(me ? me.v : val(c, id) || 0), r: 1, why: '' }); return; }
      var top = st.rows.filter(function (r) { return !r.me; })[0]; if (!top) return;
      var why = '', g = 0;
      if (me) {
        if (me.gate && (me.v >= st.need || me.gate === 'pocos')) why = me.gate;
        else if (!me.gate && me.rk === 2) { why = 'cerca'; g = round3(Math.max(0.1, top.v - me.v)); }
      }
      var o = { id: id, me: 0, n: top.n, club: top.clubName, v: round3(top.v), r: me ? me.rk : 0, why: why };
      if (g) o.g = g;
      if (why === 'top2') o.pos = pos;
      if (cat.rivals) o.r = 0;
      it.push(o);
    });
    var l = c.life || {};
    if ((l.awards || []).some(function (a) { return a && a.id === 'rook' && a.season === c.season; }))
      it.push({ id: 'rook', me: 1, n: c.player.name, club: k ? k.name : '', v: round3(E(c).avgNota(c) || 0), r: 1, why: '' });
    return { s: c.season | 0, lg: Lg ? Lg.name : '', art: Lg ? Lg.art || '' : '', it: it };
  }
  function onSeason(c) {
    var R = ensure(c);
    if (!(c.myClub >= 0) || (R.gala && R.gala.s === (c.season | 0))) return;
    var l = c.life && Array.isArray(c.life.awards) ? c.life.awards : [];
    var won0 = l.filter(function (a) { return a && a.season === c.season; }).map(function (a) { return a.id; });
    var nw = giveNew(c, won0.length > 0), won = won0.concat(nw);
    var g = buildGala(c, won), r = {};
    R.gala = g;
    catsOf(c).forEach(function (id) { var st = standings(c, id); if (st && st.me) r[id] = st.me.rk; });
    R.hist.push({ s: c.season | 0, r: r, w: won.filter(function (id) { return !!CATS[id]; }) });
    R.hist = R.hist.slice(-12);
    if (!won.length) {
      var mvp = g.it.filter(function (x) { return x.id === 'mvp'; })[0], best = 0, bid = '';
      mine(c).forEach(function (id) { if (r[id] && (!best || r[id] < best)) { best = r[id]; bid = id; } });
      msg(c, 'Gala ' + deL(leagueOf(c)), (mvp ? 'El MVP es para ' + mvp.n + (mvp.club ? ' (' + mvp.club + ')' : '') + '.' : 'Ya hay ganadores.') +
        (best ? ' Tu mejor puesto: ' + ord(best) + ' en ' + CATS[bid].name + '.' : ''));
    }
  }
  function hook(c, kind, a) {
    if (!c) return;
    if (kind === 'match') onMatch(c, a);
    else if (kind === 'season') onSeason(c);
    else if (kind === 'newSeason') { var R = ensure(c); R.prev = R.cur = null; R.mid = null; R.ann = { s: c.season | 0, best: {} }; }
    else if (kind === 'join') { var R2 = ensure(c); R2.prev = R2.cur = null; R2.ann = { s: c.season | 0, best: {} }; }   // (el corte de mitad se queda: una vez por temporada)
  }
  function gala(c) { var R = c && ensure(c); return R && R.gala && R.gala.s === (c.season | 0) ? R.gala : null; }

  // ------------------------------------------------------------------ interfaz (SPLAT; móvil primero, notes/splat.md §9)
  var Q = ':root:not(#_):not(#_):not(#_) #career', PQ = Q.replace(':root', ':root.ph');
  var KO = '1.5px 1.5px 0 var(--sp-ink),-1px -1px 0 var(--sp-ink),1px -1px 0 var(--sp-ink),-1px 1px 0 var(--sp-ink)';
  var sel = 'mvp';   // categoría elegida en Liga › Premios (no se guarda)
  function hE(H, s) { return H && H.esc ? H.esc(s) : escH(s); }
  function hSp(H, a, k) { a = a.filter(function (x) { return x !== '' && x != null; }); return H && H.sp ? H.sp(a, k) : a.join(' / '); }
  function phOn(H) { try { return !!(H && H.ph && H.ph()); } catch (e) { return false; } }
  function trHTML(d) {
    if (d == null) return '<span class="cpr-tr" aria-hidden="true"></span>';
    if (d === 'new') return '<span class="cpr-tr nw" aria-label="Entra">NUEVO</span>';
    if (d > 0) return '<span class="cpr-tr up" aria-label="Sube ' + d + '">↑' + d + '</span>';
    if (d < 0) return '<span class="cpr-tr dn" aria-label="Baja ' + (-d) + '">↓' + (-d) + '</span>';
    return '<span class="cpr-tr eq" aria-label="Igual">=</span>';
  }
  var GATE_TAG = { pocos: 'Pocos partidos', visto: 'Poco visto', top2: 'Fuera del top 2' };
  function shortName(n) { n = String(n || ''); var w = n.split(/\s+/).filter(Boolean); if (n.length <= 18 || w.length < 3) return n; return w.slice(-2).join(' '); }
  function curView(c) { var id = sel === 'pos' ? posCat(c) : sel; if (id !== 'oth' && (!CATS[id] || catsOf(c).indexOf(id) < 0)) { sel = 'mvp'; id = 'mvp'; } return id; }
  /** Móvil (movil-aire §5.4): tendencia como flecha de color (la cifra, en aria-label). */
  function trPh(d) {
    if (d == null) return '<span class="cpr-tr" aria-hidden="true"></span>';
    if (d === 'new') return '<span class="cpr-tr nw" aria-label="Entra">●</span>';
    if (d > 0) return '<span class="cpr-tr up" aria-label="Sube ' + d + '">▲</span>';
    if (d < 0) return '<span class="cpr-tr dn" aria-label="Baja ' + (-d) + '">▼</span>';
    return '<span class="cpr-tr eq" aria-label="Igual">=</span>';
  }
  /** Móvil: fila de una línea (puesto · flecha · nombre · club o «Tú · …» · nota). */
  function rowPh(c, r, st, H, R) {
    var fav = r.me && R.mid && R.mid.s === (c.season | 0) && R.mid.fav.indexOf(st.cat) >= 0;
    var sub = r.me ? ['Tú', fav ? 'Favorito' : '', r.gate ? GATE_TAG[r.gate].toLowerCase() : ''] : [r.rv ? 'Tu rival' : '', hE(H, shortName(r.clubName))];
    sub = sub.filter(Boolean).join(', ');
    return '<div class="cpr-row' + (r.me ? ' me' : '') + '" role="listitem"><span class="cpr-rk">' + (st.open ? ord(r.rk) : '') + '</span>' + (st.open ? trPh(r.d) : '<span class="cpr-tr" aria-hidden="true"></span>') +
      '<span class="cpr-nm"><b>' + hE(H, r.n) + '</b><small data-ph-ell>' + sub + '</small></span><span class="cpr-v">' + (st.open ? f1(r.v) : '') + '</span></div>';
  }
  function rowHTML(c, r, st, H, R) {
    if (phOn(H)) return rowPh(c, r, st, H, R);
    var fav = r.me && R.mid && R.mid.s === (c.season | 0) && R.mid.fav.indexOf(st.cat) >= 0;
    var tags = (r.me ? '<span class="cpr-you">Tú</span>' : '') + (r.rv ? '<span class="tag r">Tu rival</span>' : '') + (fav ? '<span class="tag y">Favorito</span>' : '') +
      (r.me && r.gate ? '<span class="tag">' + GATE_TAG[r.gate] + '</span>' : '');
    var v = st.open ? f1(r.v) : '';
    return '<div class="cpr-row' + (r.me ? ' me' : '') + '" role="listitem"><span class="cpr-rk">' + (st.open ? ord(r.rk) : '') + '</span>' + (st.open ? trHTML(r.d) : '<span class="cpr-tr" aria-hidden="true"></span>') +
      '<span class="cpr-nm"><b>' + hE(H, r.n) + '</b>' + tags + '<small data-ph-ell>' + hSp(H, [hE(H, shortName(r.clubName)), r.a ? r.a + ' años' : ''], 'v') + '</small></span>' +
      '<span class="cpr-v">' + v + '</span></div>';
  }
  function listHTML(c, st, H) {
    var R = ensure(c), rows = st.rows, mi = st.me ? st.me.rk - 1 : -1, show = rows;
    if (mi >= 6) show = rows.slice(0, 5).concat([null, rows[mi]]);
    else show = rows.slice(0, 6);
    return '<div class="cpr-list" role="list" aria-label="' + hE(H, st.label) + '">' + show.map(function (r) {
      return r ? rowHTML(c, r, st, H, R) : '<div class="cpr-row cpr-gap" role="listitem" aria-label="Más candidatos"><span class="cpr-rk">…</span></div>';
    }).join('') + '</div>';
  }
  function needCard(c, id, st, H) {
    var R = ensure(c), t = st.me ? st.me.need : needText(c, id, st), x = '';
    var bk = null; try { bk = VB.Career && VB.Career.ext && VB.Career.ext.blocked ? VB.Career.ext.blocked(c, null) : null; } catch (e) { bk = null; }
    if (bk && st.me) x += '<span class="tag r">De baja: tu media se congela</span>';
    var md = R.mid && R.mid.s === (c.season | 0) && R.mid.r[id] ? '<p class="cpr-mid">En la mitad ibas ' + ord(R.mid.r[id]) + '.</p>' : '';
    if (!t && !x && !md) return '';
    return '<div class="card cpr-need"><h3>Lo que necesitas</h3>' + (t ? '<p>' + hE(H, t) + '</p>' : '') + (x ? '<p>' + x + '</p>' : '') + md + '</div>';
  }
  function othersHTML(c, H, cur) {
    var o = others(c); if (!o.length) return '';
    return '<div class="card cpr-oth"><h3>Otras carreras</h3><div class="cpr-ol">' + o.map(function (id) {
      var st = standings(c, id), top = st && st.rows.filter(function (r) { return !r.me; })[0];
      var me = st && st.me && st.open ? 'Tú: ' + ord(st.me.rk) : '';
      return '<button type="button" class="cpr-ob' + (id === cur ? ' on' : '') + '" data-act="rc-cat" data-id="' + id + '" aria-pressed="' + (id === cur) + '">' +
        '<span class="cpr-on">' + hE(H, CATS[id].name) + '</span><span class="cpr-ot">' + (top ? hE(H, top.n) + (st.open ? ', ' + f1(top.v) : '') : '') + '</span>' +
        '<span class="cpr-or">' + me + '</span></button>';
    }).join('') + '</div></div>';
  }
  function subLine(c, st) {
    if (c.phase === 'off') return 'Temporada cerrada — resultado final';
    if (c.phase !== 'league') return 'Liga terminada — tus partidos de copa aún suman';
    return 'Jornada ' + st.wk + ' de ' + st.W + ' — se actualiza cada jornada';
  }
  var HELP = 'El 1r al final de la liga gana el premio en la gala. Para el MVP tu club debe acabar 1r o 2º. Si simulas más de la mitad de los partidos, no te ven. Con menos de 6 partidos no entras.';
  function page(c, subId, H) {
    if (!c || !(c.myClub >= 0)) return '';
    var R = ensure(c), id = curView(c), ph = phOn(H), h = '';
    if (c.phase === 'off' && gala(c)) h += galaCard(c, H);
    var st0 = standings(c, 'mvp');
    var segs = [['mvp', 'MVP', 'MVP'], ['young', 'Joven', 'Joven'], ['pos', 'Tu puesto', 'Puesto'], ['ace', 'Saque', 'Saque'], ['oth', 'Otras', 'Otras']];
    var on = function (k) { return k === 'pos' ? id === posCat(c) : k === 'oth' ? id === 'oth' || others(c).indexOf(id) >= 0 : id === k && id !== posCat(c); };
    var segH = '<div class="seg cpr-seg" role="group" aria-label="Premio">' + segs.map(function (s) {
      var o = on(s[0]);
      return '<button type="button" data-act="rc-cat" data-id="' + s[0] + '" aria-pressed="' + o + '">' + (ph ? s[2] : s[1]) + '</button>';
    }).join('') + '</div>';
    // móvil (movil-aire §5.4): sin la tarjeta-sello; el segmentado como fila pegada arriba con el «?» al final
    if (ph) h += '<div class="cpr-phb">' + segH + H.q('Carrera por los premios', subLine(c, st0) + '. ' + HELP) + '</div>';
    else h += '<div class="card cpr-head"><h3>Carrera por los premios</h3><p class="muted">' + hE(H, HELP) + '</p>' +
      '<p class="cpr-wk">' + hE(H, subLine(c, st0)) + '</p>' + segH + '</div>';
    if (id !== 'oth') {
      var st = standings(c, id), cat = CATS[id], ttl = id === posCat(c) && id !== 'ace' && id !== 'mvp' ? 'Tu puesto: ' + cat.name : cat.name;
      var wk = c.phase === 'league' ? 'jornada ' + st.wk + ' de ' + st.W : c.phase === 'off' ? 'final' : 'liga terminada';
      if (ph) h += '<div class="card cpr-tbl cpr-tph"><p class="cpr-unit">' + hE(H, ttl + ': ' + cat.unit.charAt(0).toLowerCase() + cat.unit.slice(1) + (st.open ? '' : ', favoritos') + ' — ' + wk) + '</p>' + listHTML(c, st, H) + '</div>';   // (sin el sello «MVP»)
      else h += '<div class="card cpr-tbl"><h3>' + hE(H, ttl) + '</h3><p class="cpr-unit">' + hE(H, cat.unit + (st.open ? '' : ', favoritos')) + '</p>' + listHTML(c, st, H) + '</div>';
      h += needCard(c, id, st, H);
    }
    h += othersHTML(c, H, id);
    var dk = dotKey(c); if (dk && R.seen !== dk) { R.seen = dk; try { E(c).save(c); } catch (e) { } }
    return h;
  }
  function stampLbl(c, id) { return id === posCat(c) && id !== 'ace' ? CATS[id].short : id === 'ace' ? 'Saque' : CATS[id].short; }
  /** Tarjeta pequeña en Partido: tu puesto en cada una de tus carreras. */
  function card(c, H) {
    if (!c || !(c.myClub >= 0) || (c.phase !== 'league' && c.phase !== 'cup' && c.phase !== 'ko')) return '';
    if ((statsOf(c).played | 0) < 2) return '';
    var R = ensure(c), m = mine(c), st = m.map(function (id) { return [id, standings(c, id)]; }).filter(function (x) { return x[1] && x[1].me; });
    if (!st.length) return '';
    return '<div class="card cpr-mini"><h3>Premios</h3><div class="cpr-mrow"><div class="cpr-sts" role="list">' + st.map(function (x) {
      var me = x[1].me, fav = R.mid && R.mid.s === (c.season | 0) && R.mid.fav.indexOf(x[0]) >= 0;
      return '<div class="cpr-st' + (me.rk === 1 && !me.gate ? ' lead' : '') + '" role="listitem" aria-label="' + hE(H, CATS[x[0]].name + ': ' + ord(me.rk)) + '"><span class="cpr-sl">' + hE(H, stampLbl(c, x[0])) + '</span>' +
        '<span class="cpr-sr"><b>' + ord(me.rk) + '</b>' + (me.d != null ? trHTML(me.d) : '') + '</span>' + (fav ? '<i class="cpr-fv">Favorito</i>' : '') + '</div>';
    }).join('') + '</div><div class="acts"><button type="button" data-act="rc-open">Ver la carrera</button></div></div></div>';
  }
  var WHY = { cerca: function (x) { return 'A ' + f1(x.g || 0.1) + ' del premio.'; }, top2: function (x) { return 'Tus números daban; tu club acabó ' + ord(x.pos || 3) + '.'; },
    visto: function () { return 'Tus números daban; te vieron poco.'; }, pocos: function () { return 'Con menos de 6 partidos no entras.'; } };
  function awName(id) { return id === 'rook' ? 'Revelación' : CATS[id] ? CATS[id].aw : id; }
  /** Gala de premios (fin de temporada): un premio por línea; las tuyas arriba del todo. */
  function galaCard(c, H) {
    var g = gala(c); if (!g || !g.it.length) return '';
    var it = g.it.filter(function (x) { return x.me; }).concat(g.it.filter(function (x) { return !x.me; }));
    var n = g.it.filter(function (x) { return x.me; }).length;
    return '<div class="card cpr-gala"><h3>Gala de premios</h3><p class="cpr-unit">' + hE(H, (n ? (n === 1 ? 'Te llevas 1 premio' : 'Te llevas ' + n + ' premios') : 'Esta vez no hay premio para ti') + (g.lg ? ' — ' + g.lg : '')) + '</p>' +
      '<div class="cpr-gl" role="list">' + it.map(function (x) {
        var w = !x.me && x.why && WHY[x.why] ? WHY[x.why](x) : !x.me && x.r ? 'Tú: ' + ord(x.r) + '.' : '';
        var v = f1(x.v);
        return '<div class="cpr-gi' + (x.me ? ' me' : '') + '" role="listitem"><span class="cpr-ga">' + hE(H, awName(x.id)) + '</span>' +
          '<span class="cpr-gw"><b>' + hE(H, x.n) + '</b>' + (x.me ? '<span class="cpr-stamp" aria-hidden="true">TÚ</span>' : '') +
          '<small data-ph-ell>' + hE(H, shortName(x.club)) + '</small>' + (w ? '<small class="cpr-why">' + hE(H, w) + '</small>' : '') + '</span>' +
          '<span class="cpr-v">' + v + '</span></div>';
      }).join('') + '</div></div>';
  }
  /** Aviso nuevo (punto): el corte de mitad de temporada y la gala, hasta que abres Liga › Premios. */
  function dotKey(c) { var R = c && ensure(c); if (!R || !(c.myClub >= 0)) return ''; if (gala(c)) return 'g' + c.season; if (R.mid && R.mid.s === (c.season | 0)) return 'm' + c.season; return ''; }
  function dot(c, where) { if (where !== 'race' && where !== 'league') return false; var k = dotKey(c); return !!k && ensure(c).seen !== k; }
  function act(a, btn) {
    if (a === 'rc-cat') { var id = btn && btn.getAttribute ? btn.getAttribute('data-id') : ''; if (id === 'pos' || id === 'oth' || CATS[id]) sel = id; return { render: true }; }
    if (a === 'rc-open') return { tab: 'league', s: 'race' };
    return null;
  }
  function css() {
    return [
      // cabecera y selector (trazos de pincel .seg de la Carrera; aquí solo la rejilla)
      Q + ' .cpr-wk{margin:2px 0 10px;font:600 13.5px/1.3 var(--sp-ui);color:rgba(255,244,220,.82)}',
      Q + ' .cpr-seg{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px 6px;margin:4px 0 2px;max-width:640px}',
      Q + ' .cpr-seg button{white-space:normal;line-height:1.05;padding:0 6px;min-height:44px;text-align:center}',
      Q + ' .cpr-unit{margin:0 0 8px;font:600 13px/1.3 var(--sp-ui);color:var(--sp-gold)}',
      // clasificación: filas en rejilla (puesto | tendencia | nombre y club | cifra), inclinación alterna, la tuya en parche de tu equipación
      Q + ' .cpr-list{display:flex;flex-direction:column;gap:7px;margin:4px 0 2px;max-width:640px}',
      Q + ' .cpr-row{display:grid;grid-template-columns:44px 46px minmax(0,1fr) auto;align-items:center;gap:0 8px;min-height:44px;box-sizing:border-box;padding:4px 12px 4px 8px;' +
        'border-radius:9px 13px 10px 14px/12px 9px 14px 10px;background:rgba(255,244,220,.07);transform:rotate(-.5deg)}',
      Q + ' .cpr-row:nth-child(2n){transform:rotate(.45deg);background:rgba(47,37,96,.75)}',
      Q + ' .cpr-row:nth-child(3n){background:rgba(27,181,165,.13)}',
      Q + ' .cpr-row.me{background:var(--sp-kit);color:var(--sp-kit-ink);box-shadow:0 0 0 2.5px var(--sp-ink),0 0 0 5px var(--sp-gold),3px 4px 0 5px var(--sp-ink);transform:rotate(-.6deg);z-index:1}',
      Q + ' .cpr-row.cpr-gap{min-height:26px;background:none;box-shadow:none}',
      Q + ' .cpr-row>.cpr-rk{grid-column:1}' + Q + ' .cpr-row>.cpr-tr{grid-column:2;display:block;min-height:1px}' + Q + ' .cpr-row>.cpr-nm{grid-column:3}' + Q + ' .cpr-row>.cpr-v{grid-column:4}',
      Q + ' .cpr-rk{font:400 17px/1 var(--sp-pop);color:var(--sp-gold);text-shadow:' + KO + '}',
      Q + ' .cpr-row.me .cpr-rk{color:var(--sp-cream)}',
      Q + ' .cpr-tr{font:800 13px/1 var(--sp-ui);font-variant-numeric:tabular-nums;white-space:nowrap}',
      Q + ' .cpr-tr.up{color:#8fe36e}' + Q + ' .cpr-tr.dn{color:#ff8a98}' + Q + ' .cpr-tr.eq{color:rgba(255,244,220,.55)}',
      Q + ' .cpr-tr.nw{font-size:12px;letter-spacing:.02em;color:var(--sp-gold)}',
      Q + ' .cpr-row.me .cpr-tr{padding:2px 5px;border-radius:6px;background:var(--sp-ink)}',
      Q + ' .cpr-nm{min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px}',
      Q + ' .cpr-nm b{font:400 15px/1.15 var(--sp-pop);letter-spacing:.01em;overflow-wrap:anywhere}',
      Q + ' .cpr-nm small{flex:1 0 100%;min-width:0;font:600 12px/1.25 var(--sp-ui);opacity:.82;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      Q + ' .cpr-nm .tag{margin:0;padding:1px 7px;font-size:12px}',
      Q + ' .cpr-you{display:inline-block;padding:1px 8px;border-radius:7px 10px 8px 11px;background:var(--sp-ink);color:var(--sp-gold);font:400 12px/1.3 var(--sp-pop);transform:rotate(-3deg)}',
      Q + ' .cpr-v{font:700 18px/1 var(--sp-ui);font-variant-numeric:tabular-nums;color:var(--sp-gold);text-align:right;min-width:3ch}',
      Q + ' .cpr-row.me .cpr-v{color:inherit}',
      // lo que necesitas
      Q + ' .cpr-need p{margin:4px 0;font:600 14.5px/1.4 var(--sp-ui)}',
      Q + ' .cpr-need .cpr-mid{color:var(--sp-gold)}',
      // otras carreras: filas que se pulsan (≥ 44)
      Q + ' .cpr-ol{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:9px 12px;margin:2px 0}',
      Q + ' .cpr-ob{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"n r" "t r";align-items:center;gap:2px 10px;min-height:48px;margin:0;padding:6px 12px;border:0;' +
        'border-radius:10px 14px 9px 13px/13px 9px 14px 10px;background:rgba(255,244,220,.08);color:var(--sp-cream);text-align:left;cursor:pointer;transform:rotate(.4deg);box-shadow:inset 0 0 0 2px rgba(255,244,220,.14)}',
      Q + ' .cpr-ob:nth-child(2n){transform:rotate(-.5deg);background:rgba(27,181,165,.14)}',
      Q + ' .cpr-ob.on{background:var(--sp-gold);color:var(--sp-ink);box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink)}',
      Q + ' .cpr-ob:is(.kf,:focus-visible){outline:none;box-shadow:0 0 0 2.5px var(--sp-ink),0 0 0 5.5px var(--sp-gold)}',
      Q + ' .cpr-on{grid-area:n;font:400 15px/1.15 var(--sp-pop)}',
      Q + ' .cpr-ot{grid-area:t;font:600 12.5px/1.25 var(--sp-ui);opacity:.86}',
      Q + ' .cpr-or{grid-area:r;font:700 14px/1 var(--sp-ui);font-variant-numeric:tabular-nums}',
      // tarjeta de Partido: sellos pequeños
      // (compacta: los sellos y «Ver la carrera» en una fila, para no empujar el partido hacia abajo)
      Q + ' .cpr-mrow{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px}',
      Q + ' .cpr-mrow>.acts{margin:0;flex:0 0 auto}',
      Q + ' .cpr-mrow>.acts>.sp-btn{flex:0 0 auto;--sp-h:44px;max-width:240px}',
      Q + ' .cpr-sts{display:grid;grid-template-columns:repeat(4,minmax(92px,112px));gap:12px;margin:2px 0;flex:0 1 auto}',
      Q + ' .cpr-sr{display:flex;align-items:baseline;justify-content:center;gap:6px}',
      Q + ' .cpr-st{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:52px;box-sizing:border-box;padding:6px 6px 7px;' +
        'border-radius:50% 46% 52% 48%/48% 52% 46% 50%;background:var(--sp-ink2);box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink);transform:rotate(-2deg);text-align:center}',
      Q + ' .cpr-st:nth-child(2n){transform:rotate(2deg);border-radius:46% 52% 48% 50%/52% 46% 50% 48%;background:rgba(27,181,165,.32)}',
      Q + ' .cpr-st.lead{background:var(--sp-gold);color:var(--sp-ink)}',
      Q + ' .cpr-st b{font:400 20px/1 var(--sp-pop)}',
      Q + ' .cpr-sl{font:700 12px/1.1 var(--sp-ui);letter-spacing:.02em}',
      Q + ' .cpr-st .cpr-tr{font-size:12px}',
      Q + ' .cpr-st.lead .cpr-tr.up{color:#1d6b10}' + Q + ' .cpr-st.lead .cpr-tr.eq{color:rgba(21,16,42,.6)}' + Q + ' .cpr-st.lead .cpr-tr.dn{color:#a3122a}',
      Q + ' .cpr-fv{position:absolute;top:-9px;right:-6px;padding:1px 6px;border-radius:6px;background:var(--sp-gold);color:var(--sp-ink);font:400 12px/1.3 var(--sp-pop);font-style:normal;transform:rotate(7deg);box-shadow:0 0 0 2px var(--sp-ink)}',
      // gala
      Q + ' .cpr-gl{display:flex;flex-direction:column;gap:8px;max-width:680px}',
      Q + ' .cpr-gi{display:grid;grid-template-columns:minmax(96px,30%) minmax(0,1fr) auto;align-items:center;gap:0 10px;min-height:44px;padding:5px 12px;box-sizing:border-box;' +
        'border-radius:10px 14px 9px 13px/13px 9px 14px 10px;background:rgba(255,244,220,.07);transform:rotate(.35deg)}',
      Q + ' .cpr-gi:nth-child(2n){transform:rotate(-.45deg);background:rgba(47,37,96,.75)}',
      Q + ' .cpr-gi.me{background:var(--sp-gold);color:var(--sp-ink);box-shadow:0 0 0 2.5px var(--sp-ink),3px 4px 0 2.5px var(--sp-ink)}',
      Q + ' .cpr-ga{font:400 14.5px/1.15 var(--sp-pop);color:var(--sp-gold);text-shadow:' + KO + '}',
      Q + ' .cpr-gi.me .cpr-ga{color:var(--sp-ink);text-shadow:none}',
      Q + ' .cpr-gi.me .cpr-v{color:var(--sp-ink)}',
      Q + ' .cpr-gw{min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:1px 8px}',
      Q + ' .cpr-gw b{font:700 15px/1.2 var(--sp-ui)}',
      Q + ' .cpr-gw small{flex:1 0 100%;min-width:0;font:600 12px/1.25 var(--sp-ui);opacity:.82;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      Q + ' .cpr-gw small.cpr-why{white-space:normal;opacity:1;color:#ffd98a}',
      Q + ' .cpr-gi.me small.cpr-why{color:inherit}',
      Q + ' .cpr-stamp{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--sp-ink);color:var(--sp-gold);font:400 12px/1 var(--sp-pop);transform:rotate(-12deg);box-shadow:0 0 0 2px var(--sp-cream)}',
      // — móvil (.ph) — (letra con --ph-*, nada < 12 px; toques ≥ 44; sin desplazamiento lateral)
      PQ + ' .cpr-wk{display:none}',
      PQ + ' .cpr-seg{max-width:none;gap:8px 6px}',
      PQ + ' .cpr-seg button{font-size:var(--ph-label);min-height:44px;padding:0 4px}',
      PQ + ' .cpr-unit{font-size:var(--ph-label)}',
      PQ + ' .cpr-list{max-width:none;gap:var(--ph-s2)}',
      PQ + ' .cpr-row{grid-template-columns:40px 44px minmax(0,1fr) auto;min-height:48px;padding:4px 12px 4px 6px}',
      PQ + ' .cpr-rk{font-size:var(--ph-row)}',
      PQ + ' .cpr-tr{font-size:var(--ph-cap)}',
      PQ + ' .cpr-tr.nw{font-size:var(--ph-cap);letter-spacing:0}',
      PQ + ' .cpr-nm b{font-size:var(--ph-row)}',
      PQ + ' .cpr-nm small{font-size:var(--ph-cap)}',
      PQ + ' .cpr-nm .tag{font-size:var(--ph-cap)}',
      PQ + ' .cpr-you{font-size:var(--ph-cap)}',
      PQ + ' .cpr-v{font-size:var(--ph-num)}',
      PQ + ' .cpr-need p{font-size:var(--ph-body)}',
      PQ + ' .cpr-ol{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--ph-s2) var(--ph-s3)}',
      PQ + ' .cpr-ob{min-height:52px}',
      PQ + ' .cpr-on{font-size:var(--ph-row)}',
      PQ + ' .cpr-ot{font-size:var(--ph-cap)}',
      PQ + ' .cpr-or{font-size:var(--ph-label)}',
      PQ + ' .cpr-sts{flex:1 1 100%;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:var(--ph-s3) 10px}',
      PQ + ' .cpr-mrow>.acts{flex:1 1 100%}',
      PQ + ' .cpr-st{min-height:60px}',
      PQ + ' .cpr-st b{font-size:var(--ph-num)}',
      PQ + ' .cpr-sl{font-size:var(--ph-cap)}',
      PQ + ' .cpr-st .cpr-tr{font-size:var(--ph-cap)}',
      PQ + ' .cpr-fv{font-size:var(--ph-cap)}',
      PQ + ' .cpr-gl{max-width:none}',
      PQ + ' .cpr-gi{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"a v" "w v";gap:2px 10px;min-height:52px;padding:6px 12px}',
      PQ + ' .cpr-ga{grid-area:a;font-size:var(--ph-label)}',
      PQ + ' .cpr-gw{grid-area:w}',
      PQ + ' .cpr-gi>.cpr-v{grid-area:v}',
      PQ + ' .cpr-gw b{font-size:var(--ph-row)}',
      PQ + ' .cpr-gw small{font-size:var(--ph-cap)}',
      PQ + ' .cpr-stamp{font-size:var(--ph-cap);width:32px;height:32px}',
      // — móvil «con aire» (movil-aire §5.4, paquete carrera-liga-vida): segmentado pegado arriba (44) con el «?» al final, sin sellos,
      // filas de 48 en una línea (puesto · flecha · nombre · club · nota) y tu fila siempre a la vista (pegada abajo si queda fuera)
      PQ + ' .cpr-phb{position:sticky;top:-10px;z-index:4;display:flex;align-items:center;gap:10px;margin:-10px -4px 6px;padding:6px 4px;background:var(--sp-ink);box-shadow:0 6px 10px -6px rgba(10,6,24,.9)}',
      PQ + ' .cpr-phb>.cpr-seg{flex:1 1 auto;min-width:0;margin:0;gap:8px}',
      PQ + ' .cpr-phb>.cpr-seg button{min-height:44px;padding:0 2px;white-space:nowrap}',
      PQ + ' .cpr-phb>.cr-q{position:relative;top:auto;right:auto;flex:none;width:44px;height:44px;min-width:44px;margin:0;transform:none}',
      PQ + ' .card.cpr-tph{margin:0 0 16px;padding:0;background:none;border:0;box-shadow:none}',   // (un solo marco: las filas ya son cajas)
      Q.replace(':root', ':root.ph.ph-s') + ' .cpr-phb{padding:3px 4px}',
      Q.replace(':root', ':root.ph.ph-s') + ' .cpr-tph .cpr-row{min-height:46px}',
      PQ + ' .cpr-tph>.cpr-unit{margin:0 0 4px;padding:0 4px;font:700 var(--ph-cap)/1.25 var(--sp-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      PQ + ' .cpr-tph .cpr-list{gap:4px}',
      PQ + ' .cpr-tph .cpr-row{grid-template-columns:32px 16px minmax(0,1fr) auto;gap:0 8px;min-height:48px;padding:0 12px 0 6px;transform:none}',
      PQ + ' .cpr-tph .cpr-row:not(.me){background:rgba(29,21,48,.84)}',   // (sin la tarjeta detrás: filas opacas sobre el pabellón)
      PQ + ' .cpr-tph .cpr-row:not(.me):nth-child(2n){transform:none;background:rgba(47,37,96,.9)}',
      PQ + ' .cpr-tph .cpr-row.cpr-gap{background:none!important}',
      PQ + ' .cpr-tph>.cpr-unit{display:inline-block;max-width:100%;border-radius:8px;background:rgba(29,21,48,.84)}',
      PQ + ' .cpr-tph .cpr-row.me{position:sticky;bottom:0;top:52px;z-index:3;transform:none;box-shadow:0 0 0 2.5px var(--sp-ink),0 0 0 4.5px var(--sp-gold)}',
      PQ + ' .cpr-tph .cpr-row.cpr-gap{min-height:18px;padding:0 6px}',
      PQ + ' .cpr-tph .cpr-tr{font:400 16px/1 var(--sp-ui);text-align:center}',
      PQ + ' .cpr-tph .cpr-tr.nw{font-size:12px}',
      PQ + ' .cpr-tph .cpr-row.me .cpr-tr{padding:0;background:none}',
      PQ + ' .cpr-tph .cpr-nm{flex-wrap:nowrap;align-items:baseline;gap:8px}',
      PQ + ' .cpr-tph .cpr-nm b{flex:0 1 auto;min-width:0;max-width:62%;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;overflow-wrap:normal}',
      PQ + ' .cpr-tph .cpr-nm small{flex:1 1 0;min-width:0;font-size:13px}',
      PQ + ' .cpr-tph .cpr-v{font-size:var(--ph-row)}'
    ].join('\n');
  }

  // ------------------------------------------------------------------ muestra para tools/mobaudit (filas race: '', 'data', 'gala')
  /** Perfil de una temporada buena: tu cifra en cada categoría respecto al umbral (×k) y la nota. */
  function fakeStats(c, n, k) {
    var nd = needs(c), S = c.stats, h = isH(c), pc = posCat(c);
    var per = function (id, m) { return nd[id].need * m; };
    S.played = n; S.sim = 1; S.won = Math.round(n * 0.65);
    S.pts = Math.round(per('pts', pc === 'opp' || pc === 'rec' ? 0.97 * k : 0.82 * k) * n);
    S.aces = Math.round(per('ace', 0.98 * k) * n);
    S.blocks = Math.round(per('blk', pc === 'blk' ? 1.06 * k : 0.7) * n);
    S.digs = Math.round(per('dig', pc === 'dig' ? 1.04 * k : 0.75) * n);
    S.assists = Math.round((h && pc === 'set' ? per('set', 1.05 * k) : 2.5) * n);
    S.kills = Math.round((h ? Math.max(1, per('rec', 1.04 * k) - 0.5 * S.digs / n) : S.pts / n * 0.8) * n);
    S.errors = Math.max(0, Math.round((S.pts - per('opp', 1.0 * k) * n)));
    var nt = nd.mvp.need - 0.05 * (k > 1 ? 1 : 4);
    (c.notes || []).forEach(function (x, i) { if (x) { x.nota = round1(nt + (i % 3 - 1) * 0.3); x.sim = i === 0; } });
  }
  function demo(c, tipo) {
    c = c || (VB.Career && VB.Career.get && VB.Career.get());
    if (!c || !(c.myClub >= 0) || c.phase === 'pick') return false;
    var e = E(c), R = ensure(c), guard = 0;
    if (tipo === 'data') {
      var mw = midW(c);
      while (c.phase === 'league' && (c.week | 0) < mw + 2 && guard++ < 80) { if (!e.simulateNext(c)) break; }
      R = ensure(c);
      var n = Math.max(2, statsOf(c).played | 0);
      fakeStats(c, Math.max(2, n - 1), 0.97); R.prev = null; R.cur = snap(c);
      if (!(R.mid && R.mid.s === (c.season | 0))) midCut(c, R.cur);
      fakeStats(c, n, 1.02); R.prev = R.cur; R.cur = snap(c);
    } else if (tipo === 'gala') {
      while (c.phase !== 'off' && guard++ < 300) { if (!e.simulateNext(c)) break; }
      if (c.phase !== 'off') return false;
      R = ensure(c);
      fakeStats(c, Math.max(6, statsOf(c).played | 0), 1.03);
      R.gala = null; R.hist = R.hist.filter(function (x) { return x.s !== (c.season | 0); });
      var won = catsOf(c).filter(function (id) { var st = standings(c, id); return st && st.me && st.me.rk === 1 && !st.me.gate && !CATS[id].rivals; });
      R.gala = buildGala(c, won);
    } else poolOf(c);
    e.save(c);
    return true;
  }

  // ------------------------------------------------------------------ registro
  var UI = { card: card, page: page, galaCard: galaCard, act: act, css: css, dot: dot };
  VB.CareerRace = {
    ensure: ensure, hook: hook, CATS: CATS, AWARDS: AWARDS, RACE_CAL: RACE_CAL, YOUNG_MAX: YOUNG_MAX,
    needOf: needOf, needs: needs, standings: standings, mine: mine, others: others, posCat: posCat, rankOf: rankOf, leaders: leaders, gala: gala,
    catsOf: catsOf, ord: ord, ui: UI,
    _needF: needF, _snap: snap, _pool: poolOf, _gate: gateOf, _val: val, _needText: needText, _demo: demo, _sel: function (v) { if (v != null) sel = v; return sel; }
  };
  (VB.CareerExt = VB.CareerExt || []).push({
    id: 'race', hook: hook,
    caseAwards: function () { return AWARDS.map(function (a) { var o = { id: a.id, name: a.name, need: a.need }; if (a.only) o.only = a.only; return o; }); },
    _demo: demo
  });
  (VB.CareerUIExt = VB.CareerUIExt || []).push({
    id: 'race', prefix: 'rc-',
    subs: [{ tab: 'league', id: 'race', label: 'Premios', labelPh: 'Premios', has: function (c) { return !!(c && c.myClub >= 0 && c.phase !== 'pick'); } }],
    page: page, match: card, seasonEnd: function (c, H) { return c && c.phase === 'off' ? galaCard(c, H) : ''; }, dot: dot, act: act, css: css
  });
})(typeof window !== 'undefined' ? window : globalThis);
