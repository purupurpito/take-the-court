/* TAKE THE COURT — js/career-loan.js (owner: cesiones)
 * Cesiones y pedir el traspaso (VB.CareerLoan), en la Carrera de playa y en la de pista.
 *  1. «Malestar» (c.loan.mood, 0-100): sube cuando no juegas (fuera de la convocatoria, banquillo sin entrar, unos pocos puntos) y baja
 *     cuando sales de inicio. Niveles: Tranquilo, Con ganas de jugar, Molesto y Quemado. Se ve en Club › Contrato y NO cambia nada en
 *     el campo (jugado y simulado, iguales). Al pasar de 45 el agente avisa (una vez por temporada).
 *  2. Pedir el traspaso (sustituye la tarjeta «Traspaso» de Club › Contrato): el club contesta según tus minutos, lo que pesas en el
 *     equipo y la confianza del entrenador: acepta (transferible, −4), te ofrece renovar con un rol más (firmas o «Prefiero salir»,
 *     −8), te ofrece una cesión, o se niega (lo aceptas, +2, o insistes: transferible, −12). Una petición (traspaso o cesión) por
 *     tramo: primera vuelta, desde la ventana de mitad y verano. Las ofertas que llegan son las de siempre (Club › Ofertas).
 *  3. Cesiones: la pides tú o te la propone el club cuando no juegas. Hasta 3 clubes más pequeños que te quieren de titular (pista:
 *     tu país, tu liga o una inferior, y solo si sales de inicio; playa: tu circuito o el de abajo, con la pareja que tendrías).
 *     Media temporada (ventana de mitad → fin de temporada) o temporada entera (se elige en verano; gasta una temporada de tu
 *     contrato, así que no cabe en la última). Cedido cobras tu sueldo, tu contrato de origen se guarda y no hay ventana de mitad.
 *     Al acabar la temporada vuelves solo y el entrenador la valora: A (+15 y, si eras de rotación, vuelves de titular; +2 de interés
 *     en las ofertas de ese verano), B (+8), C (+2), D (−5). Las ofertas de fin de temporada y la renovación salen ya desde tu club.
 *  4. En la playa la cesión también es a otro club (la playa va por clubes); el cambio de pareja ya existe en Club › Compañero.
 *  5. De baja (VB.CareerInjury.out): ni pedir cesión ni traspaso («Estás de baja.»), ni propuesta del club ni ir cedido; las jornadas
 *     de baja (sum.out, también las de selección) no cuentan como banquillo para la cesión (c.loan.xb de la temporada c.loan.xbS).
 * Registro: VB.CareerExt (núcleo: hook, offerBonus, midOffers, holdOffers, postSeason, _demo) y VB.CareerUIExt (interfaz: tarjeta del
 * traspaso, Cesiones en Club › Ofertas, avisos en Partido y en el fin de temporada, puntos y acciones 'ln-'). API en CONTRACT.md
 * «Extensiones de la Carrera».
 * Reglas: cada cambio del núcleo (club, contrato, confianza, pareja, plantilla, transferible) sale de una ELECCIÓN del jugador o de la
 * vuelta automática de una cesión que eligió. Si el jugador no toca nada, solo cambian c.loan, c.inbox y c.msgN. Azar solo por hash
 * de la semilla ('ln-…'); sin Math.random ni g.rng; no toca la sim ni los partidos. Sin DOM al cargar (node: tools/loantest.js).
 * Estado en c.loan (sin subir VER/VER6; ensure idempotente y sin tiradas). Bajar de versión con una cesión en curso: la carrera
 * sigue en el club de la cesión con su contrato de 1 temporada (renovación u ofertas normales al acabar). Degradación aceptable.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};

  // ------------------------------------------------------------------ motor (como K(c) de career-life.js)
  // VB.Career.ext.engine(c) da el motor de esa carrera; la pista no redefine las utilidades comunes (_msg, _rng, roleIdx…), así que
  // con una carrera de pista se usa una vista «pista sobre playa» (lo de la pista y, lo demás, de la playa).
  var HV = null, HVsrc = null;
  function K(c) {
    var C = VB.Career; if (!c || !C || !C.beach) return C;
    if (!hall(c) || !C.hall) return C.beach;
    if (HVsrc !== C.hall) { HVsrc = C.hall; HV = {}; var k; for (k in C.beach) HV[k] = C.beach[k]; for (k in C.hall) HV[k] = C.hall[k]; }
    return HV;
  }
  function hall(c) { return !!(c && c.mode === 'hall'); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clampI(v, a, b) { return clamp(Math.round(+v || 0), a, b); }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function obj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function copy(o) { return o == null ? null : JSON.parse(JSON.stringify(o)); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function eur(v) { return String(Math.round(+v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €'; }
  function dec(v) { return v == null || !isFinite(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); }
  /** Ordinal corto (estilo de Ferran): 1r, 2º, 3r, 4º… Nunca «1.er». */
  function ordn(n) { return n + (n === 1 || n === 3 ? 'r' : 'º'); }
  function rng(c) { var E = K(c), a = Array.prototype.slice.call(arguments, 1); return E._rng(E._hash.apply(null, [c.seed].concat(a))); }
  function msg(c, k, t, x) { try { return K(c)._msg(c, k, t, x); } catch (e) { return null; } }
  function club(c, id) { if (!c || !Array.isArray(c.clubs)) return null; for (var i = 0; i < c.clubs.length; i++) if (c.clubs[i] && c.clubs[i].id === id) return c.clubs[i]; return null; }
  function myClub(c) { return club(c, c.myClub); }
  function ROLE_LV() { var R = VB.Career && VB.Career.beach && VB.Career.beach.ROLE_LV; return R || ['Rotación', 'Titular', 'Titular indiscutible']; }
  function roleIdx(c) { var R = ROLE_LV(); return c && c.contract ? Math.max(0, R.indexOf(c.contract.role)) : 1; }
  function pOvr(c) { try { return K(c).playerOvr(c); } catch (e) { return 0; } }
  /** De baja por lesión ahora mismo (career-injury.js, opcional). De baja no se pide ni se va cedido. */
  function injOut(c) { try { var I = VB.CareerInjury; return !!(I && I.out && I.out(c)); } catch (e) { return false; } }

  // ------------------------------------------------------------------ constantes
  var NUM = {
    ASK_COACH_YES: -4, INSIST: -12, LISTED: -8, NO_OK: 2, RENEW_COACH: 5, PASS_CLUB: 2, RENEW_MOOD: -30, LIST_MOOD: -10,
    MOOD: { bench: 15, out: 12, subLow: 7, sub: 3, play: -6, start: -8, broken: 20 }, SUB_LOW: 0.15,
    WARN: 45, CLUB_MOOD: 65, P_CLUB_MID: 0.3, P_CLUB_END: 0.35, AGE_CLUB: 26, CLUB_BENCH: 2,
    GRADE_COACH: { A: 15, B: 8, C: 2, D: -5 }, BONUS_A: 2, MAX_OPTS: 3, LOG_MAX: 20
  };
  // [desde, nombre, tag, color del medidor]
  var MOOD = [[0, 'Tranquilo', 'g', '#2fbf71'], [25, 'Con ganas de jugar', '', '#d9a520'], [45, 'Molesto', 'y', '#e07b2b'], [65, 'Quemado', 'r', '#d8364a']];
  // [letra, nota media mínima, parte de jornadas jugadas mínima], por modo. Calibrado con las notas simuladas de un titular cedido
  // (loantest §7, unas 20 cesiones por modo): pista 4,8-6,1 y playa 5,5-6,7 → A ~15 %, D ~25 %. En pista, la media de una temporada
  // entera se aprieta (4,9-5,7): tabla propia (hallS).
  var GRADES = { hall: [['A', 5.8, 0.7], ['B', 5.5, 0.5], ['C', 5.3, 0], ['D', -1, 0]], hallS: [['A', 5.5, 0.7], ['B', 5.4, 0.5], ['C', 5.2, 0], ['D', -1, 0]], beach: [['A', 6.4, 0.7], ['B', 6.1, 0.5], ['C', 5.8, 0], ['D', -1, 0]] };
  var GRADE_TXT = { A: 'Cesión de sobresaliente.', B: 'Buena cesión. Aquí tendrás más oportunidades.', C: 'Cesión discreta. Toca demostrarlo aquí.', D: 'La cesión no ha salido bien. Empezamos de cero.' };
  function moodLv(v) { var i = 0; for (var j = 0; j < MOOD.length; j++) if (v >= MOOD[j][0]) i = j; return { i: i, name: MOOD[i][1], tag: MOOD[i][2], col: MOOD[i][3] }; }

  // ------------------------------------------------------------------ estado
  function zeros() { return { played: 0, bench: 0, starts: 0, subIn: 0 }; }
  function bOf(c) { var s = c.stats || {}; return { played: s.played | 0, bench: s.bench | 0, starts: s.starts | 0, subIn: s.subIn | 0 }; }
  /** c.loan con sus valores por defecto (idempotente, sin tiradas). Una cesión en curso que ya no cuadra se cierra sin restaurar nada. */
  function ensure(c) {
    if (!c) return null;
    var l = c.loan;
    if (!obj(l)) l = c.loan = {};
    l.v = 1;
    l.mood = clampI(l.mood, 0, 100);
    ['moodW', 'brk', 'bonusS', 'midS', 'midAt', 'run', 'optK', 'clubS', 'xb', 'xbS'].forEach(function (k) { l[k] = num(l[k]) ? l[k] | 0 : 0; });
    l.seg = num(l.seg) ? l.seg | 0 : -1;
    var R = ROLE_LV();
    if (l.ask != null && !(obj(l.ask) && /^(renew|no|loan)$/.test(l.ask.k) && num(l.ask.seg) &&
      (l.ask.k !== 'renew' || (R.indexOf(l.ask.role) >= 0 && num(l.ask.salary) && num(l.ask.years))))) l.ask = null;
    if (l.ask === undefined) l.ask = null;
    if (l.want != null && !(obj(l.want) && (l.want.at === 'mid' || l.want.at === 'end') && num(l.want.s))) l.want = null;
    if (l.want === undefined) l.want = null;
    if (l.want && l.want.by !== 'club') l.want.by = 'me';
    if (!Array.isArray(l.opts)) l.opts = [];
    l.opts = l.opts.filter(function (o) { return obj(o) && club(c, o.club) && o.club !== c.myClub; }).slice(0, NUM.MAX_OPTS);
    if (l.optAt !== 'mid' && l.optAt !== 'end') l.optAt = '';
    if (l.optBy !== 'club') l.optBy = 'me';
    if (!l.opts.length) l.optAt = '';
    if (l.on != null) {
      var on = l.on, okOn = obj(on) && obj(on.home) && club(c, on.home.club) && club(c, on.club) && obj(on.home.contract) && c.myClub === on.club && num(on.s);
      if (!okOn) { l.on = null; msg(c, 'loan', 'Cesión cerrada', 'Los datos de tu cesión no cuadraban y se ha cerrado. Sigues en tu club de ahora.'); }
      else {
        if (on.len !== 'season') on.len = 'half';
        on.n0 = clampI(on.n0, 0, 999); on.xo = clampI(on.xo, 0, 999);
        if (!obj(on.b0)) on.b0 = zeros();
        ['played', 'bench', 'starts', 'subIn'].forEach(function (k) { on.b0[k] = num(on.b0[k]) ? on.b0[k] | 0 : 0; });
        if (typeof on.name !== 'string') on.name = club(c, on.club).name;
      }
    }
    if (l.on === undefined) l.on = null;
    if (l.last != null && !obj(l.last)) l.last = null;
    if (l.last === undefined) l.last = null;
    if (!Array.isArray(l.log)) l.log = [];
    l.log = l.log.filter(obj).slice(-NUM.LOG_MAX);
    return l;
  }

  // ------------------------------------------------------------------ tramos y ventanas
  function midW(c) { var E = K(c); try { return hall(c) ? E.midWeek(c) | 0 : E.MID_WEEK | 0; } catch (e) { return 7; } }
  /** Tramo: season·10 + 0 (primera vuelta), 5 (desde la ventana de mitad, también copa o eliminatorias) o 9 (verano). */
  function seg(c) { return (c.season | 0) * 10 + (c.phase === 'off' ? 9 : c.phase === 'league' && (c.week | 0) < midW(c) ? 0 : 5); }
  function wk(c) { return (c.season | 0) * 1000 + (c.week | 0); }
  /** Ventana de mitad abierta: desde el partido que la abre hasta el siguiente (la misma regla que «caducan al jugar»). */
  function midOpen(c) { var l = ensure(c); return c.phase === 'league' && ((l.midAt && l.midAt === wk(c)) || (c.window === 'mid' && (c.week | 0) === midW(c))); }
  function endOpen(c) { return c.phase === 'off' && c.window === 'end'; }
  /** La próxima ventana para una cesión: {at, now}. */
  function nextAt(c) {
    if (c.phase === 'off') return { at: 'end', now: endOpen(c) };
    if (midOpen(c)) return { at: 'mid', now: true };
    return { at: seg(c) % 10 === 0 ? 'mid' : 'end', now: false };
  }

  // ------------------------------------------------------------------ datos del jugador en su club
  function nextLid(c, k) { var mv = (c.pendingMoves || []).filter(function (m) { return m && m.id === k.id; })[0]; return mv ? mv.to : hall(c) ? k.lid : k.lvl; }
  function lg(c, k, off) { var E = K(c); return hall(c) ? E.league(off ? nextLid(c, k) : k.lid, c) : E.league(off ? nextLid(c, k) : k.lvl); }
  function clubAvg(c, k) { try { return hall(c) ? k.ovr : K(c).clubOvr(k); } catch (e) { return 0; } }
  function sal(c, k, rl, off) {
    var E = K(c);
    try {
      if (hall(c)) return E.salary(c, k, rl, off ? nextLid(c, k) : k.lid);
      var q = off && c.pendingQ && c.pendingQ[k.id] != null ? c.pendingQ[k.id] : k.q;
      return E._salaryOf(off ? nextLid(c, k) : k.lvl, q, rl);
    } catch (e) { return c.contract ? c.contract.salary | 0 : 0; }
  }
  /** Jornadas de banquillo de la temporada que cuentan para la cesión: c.stats.bench sin las de baja (lesión o selección: sum.out,
   *  contadas en c.loan.xb). Una lesión no es «no juegas». */
  function benchN(c) {
    var s = c.stats || {}, l = c.loan, xb = l && l.xbS === (c.season | 0) ? l.xb | 0 : 0;
    return Math.max(0, (s.bench | 0) - xb);
  }
  /** Pocos minutos: pista, menos de la mitad de las jornadas de inicio (con 3 o más); playa, alguna jornada en el banquillo. */
  function low(c) {
    var s = c.stats || {}, b = benchN(c);
    if (hall(c)) { var J = (s.starts | 0) + (s.subIn | 0) + b; return J >= 3 && (s.starts | 0) / J < 0.5; }
    return b >= 1;
  }
  /** «Te necesitan»: pista, estás en el seis de la jornada; playa, juegas de titular o más con la confianza del entrenador. */
  function imp(c) {
    var rl = roleIdx(c);
    if (hall(c)) {
      try { var d = K(c).depthNow(c), S = K(c).SLOTS || {}, pos = K(c).ctrlRole(c); if (d && d.k > 0) return d.k <= (S[pos] || 1); } catch (e) { }
      return rl >= 1 && c.coach >= 50;
    }
    return rl >= 1 && c.coach >= 50;
  }

  // ------------------------------------------------------------------ motivos
  function askWhy(c) {
    var l = ensure(c);
    if (!c.contract || c.phase === 'pick' || c.myClub < 0) return 'Aún no tienes club.';
    if (l.on) return 'Estás cedido.';
    if (injOut(c)) return 'Estás de baja.';
    if (c.listed) return 'Ya eres transferible.';
    if (l.ask) return 'Contesta primero al club.';
    if (l.seg === seg(c)) return 'Ya lo pediste: espera a la próxima ventana.';
    return '';
  }
  function loanWhy(c) {
    var l = ensure(c);
    if (!c.contract || c.phase === 'pick' || c.myClub < 0) return 'Aún no tienes club.';
    if (l.on) return 'Estás cedido.';
    if (injOut(c)) return 'Estás de baja.';
    if (roleIdx(c) >= 2) return 'Eres titular indiscutible: no te ceden.';
    if (l.opts.length) return 'Ya tienes cesiones para elegir.';
    if (l.want) return 'El club ya te busca equipo.';
    if (l.ask) return 'Contesta primero al club.';
    if (l.seg === seg(c)) return 'Ya lo pediste: espera a la próxima ventana.';
    if (c.phase === 'off' && ((c.contract.left | 0) < 2 || (c.review && c.review.renew))) return 'Se te acaba el contrato: primero decide si renuevas.';
    if (c.phase !== 'off' && nextAt(c).at === 'end' && (c.contract.left | 0) <= 1) return 'Se te acaba el contrato: primero decide si renuevas.';   // (la de verano sería de temporada entera)
    return '';
  }

  // ------------------------------------------------------------------ candidatos (puro y determinista)
  /** Hasta 3 cesiones para la ventana at ('mid' | 'end'). Pista: tu país, liga igual o más floja, media del club ≤ la tuya − 2 y
   *  saldrías de inicio. Playa: tu circuito o el de abajo, clubes más flojos que el tuyo, con la pareja que tendrías. */
  function cands(c, at) {
    var me = myClub(c); if (!me || !c.contract) return [];
    var off = at === 'end', len = off ? 'season' : 'half', E = K(c), salary = c.contract.salary | 0, out = [];
    if (hall(c)) {
      var po = c.pendingOvr, ovr = function (k) { return off && po && po[k.id] != null ? po[k.id] : k.ovr; };
      var myL = lg(c, me, off), myO = ovr(me), p = pOvr(c), season = off ? c.season + 1 : c.season;
      if (!myL) return [];
      var list = c.clubs.filter(function (k) {
        if (!k || k.id === me.id) return false;
        var L = lg(c, k, off); if (!L || L.cc !== myL.cc || L.strength > myL.strength) return false;
        var o = ovr(k); if (o > myO - 2 || o < p - 15) return false;
        if (!off) { try { if (E.weeksOf(c, k.lid) - (c.week | 0) < 3) return false; } catch (e) { return false; } }
        return true;
      }).map(function (k) {
        var L = lg(c, k, off), d = null;
        try { d = E.depth(c, { id: k.id, ovr: ovr(k) }, L.id, season, 1); } catch (e) { d = null; }
        return { k: k, L: L, o: ovr(k), d: d };
      }).filter(function (x) { return x.d; });
      var st = list.filter(function (x) { return x.d.start; });   // (solo donde saldrías de inicio: sin reserva de «pelearás el sitio»)
      st.sort(function (a, b) { return (0.5 * b.L.strength + b.o + 2 * Math.min(b.d.gap, 3)) - (0.5 * a.L.strength + a.o + 2 * Math.min(a.d.gap, 3)) || a.k.id - b.k.id; });
      st.slice(0, NUM.MAX_OPTS).forEach(function (x) {
        out.push({ club: x.k.id, lid: x.L.id, cc: x.L.cc, ovr: x.o, role: ROLE_LV()[1], years: 1, salary: salary, loan: 1, len: len,
          depth: { start: !!x.d.start, gap: x.d.gap, rank: x.d.rank, slots: x.d.slots } });
      });
      return out;
    }
    var pq = c.pendingQ, qOf = function (k) { return off && pq && pq[k.id] != null ? pq[k.id] : k.q; };
    var lv = function (k) { return off ? nextLid(c, k) : k.lvl; }, myLv = lv(me), myQ = qOf(me);
    var bl = c.clubs.filter(function (k) {
      if (!k || k.id === me.id) return false;
      var kl = lv(k); if (kl !== myLv && kl !== myLv - 1) return false;
      return kl < myLv || qOf(k) <= myQ - 0.05;
    });
    bl.sort(function (a, b) { return lv(b) - lv(a) || qOf(b) - qOf(a) || a.id - b.id; });
    bl.slice(0, NUM.MAX_OPTS).forEach(function (k) {
      var kl = lv(k), L = E.league(kl), q = qOf(k), o = L.ovr[0] + (L.ovr[1] - L.ovr[0]) * q;
      var rm = rng(c, 'ln-mate', c.season, at, k.id), mp = null;
      try { mp = E._newMate(c, k, rm, clamp(Math.round(o + E._mateOff(rm)), 22, 92)); } catch (e) { mp = null; }
      out.push({ club: k.id, lvl: kl, ovr: Math.round(o), q: q, mate: mp ? E.ovrOf(mp.st) : Math.round(o), mateP: mp, role: ROLE_LV()[1], years: 1, salary: salary, loan: 1, len: len });
    });
    return out;
  }

  /** Abre las cesiones de la ventana at. by: 'me' (las pediste) o 'club'. Devuelve cuántas. */
  function openOpts(c, at, by) {
    var l = ensure(c), list = cands(c, at);
    if (!list.length) { msg(c, 'agent', 'Cesión: sin destino', 'Ningún club encaja ahora mismo. Lo miramos en la próxima ventana.'); return 0; }
    l.opts = list; l.optAt = at; l.optBy = by === 'club' ? 'club' : 'me'; l.optK = wk(c);
    var n = list.length, who = n === 1 ? 'Hay un club que te quiere' : 'Hay ' + n + ' clubes que te quieren', when = at === 'mid' ? 'hasta final de temporada' : 'toda la temporada que viene';
    var cad = at === 'mid' ? 'Caducan al jugar.' : 'Caducan al empezar la temporada.';
    if (by === 'club') msg(c, 'loan', 'El club te propone una cesión', 'Aquí te cuesta jugar. ' + who + ' de titular ' + when + '. Míralos en Club › Ofertas. ' + cad);
    else msg(c, 'loan', 'Cesión: ' + plural(n, 'destino', 'destinos'), 'Tu agente lo ha movido. ' + who + ' de titular ' + when + '. Míralos en Club › Ofertas. ' + cad);
    return n;
  }

  // ------------------------------------------------------------------ valoración de la cesión (pura)
  /** {letter, n, avg, J, share}: n = partidos con nota en la cesión, J = jornadas (jugadas + sin jugar), share = n / J. */
  function grade(c, on) {
    on = on || (c.loan && c.loan.on); if (!on) return null;
    var notes = (c.notes || []).slice(on.n0 | 0).filter(function (x) { return x && num(x.nota); }), n = notes.length;
    var avg = n ? notes.reduce(function (s, x) { return s + x.nota; }, 0) / n : null;
    // (las jornadas de baja —lesión o selección— no cuentan: una lesión no castiga)
    var b = bOf(c), b0 = on.b0 || zeros(), J = Math.max(n, (b.played - (b0.played | 0)) + (b.bench - (b0.bench | 0)) - (on.xo | 0));
    var share = n / Math.max(1, J), L = 'D', G = GRADES[hall(c) ? (on.len === 'season' ? 'hallS' : 'hall') : 'beach'];
    if (n >= 2) for (var i = 0; i < G.length; i++) if (avg >= G[i][1] && share >= G[i][2]) { L = G[i][0]; break; }
    return { letter: L, n: n, avg: avg == null ? null : Math.round(avg * 10) / 10, J: J, share: Math.round(share * 100) / 100, out: Math.max(0, J - n) };
  }

  // ------------------------------------------------------------------ malestar (hook 'match')
  function moodStep(c, sum) {
    var l = ensure(c), M = NUM.MOOD, d = 0, start = false;
    if (hall(c)) {
      var pt = sum.part || {};
      if (sum.bench && pt.status !== 'sub') pt = { status: 'out' };
      if (pt.status === 'out') d = M.out;
      else if (pt.status === 'sub') d = (+pt.share || 0) < NUM.SUB_LOW ? M.subLow : M.sub;
      else { d = M.start; start = true; }
    } else if (sum.bench) d = M.bench;
    else { d = M.play; start = true; }
    if (c.broken === c.season && l.brk !== c.season) { d += M.broken; l.brk = c.season; }
    var m0 = l.mood;
    l.mood = clampI(l.mood + d, 0, 100);
    l.run = start ? 0 : l.run + 1;
    if (m0 < NUM.WARN && l.mood >= NUM.WARN && l.moodW !== c.season && !l.on) {
      l.moodW = c.season;
      var nb = hall(c) ? l.run : benchN(c);
      var t = nb >= 2 ? (hall(c) ? 'Llevas ' + nb + ' jornadas sin salir de inicio.' : 'Llevas ' + plural(nb, 'jornada', 'jornadas') + ' en el banquillo esta temporada.') : 'No estás jugando lo que esperabas.';
      msg(c, 'agent', 'Hay que hablar de minutos', t + ' Así no creces. Puedes pedir una cesión o el traspaso en Club › Contrato.');
    }
  }
  function expireAsk(c) {
    var l = ensure(c);
    if (l.ask && l.ask.seg !== seg(c)) {
      if (l.ask.k === 'renew') msg(c, 'club', 'Renovación retirada', 'La oferta de renovación ya no está sobre la mesa.');
      l.ask = null;
    }
  }
  /** ¿El club propone una cesión? (mitad: la temporada en curso; verano: la temporada entera). */
  function clubWants(c, at) {
    var l = ensure(c), rl = roleIdx(c), age = (c.player && c.player.age) | 0;
    if (l.on || l.opts.length || l.want || rl >= 2 || !c.contract || injOut(c)) return false;   // (de baja, no)
    if (l.clubS === c.season) return false;   // (una propuesta del club por temporada)
    var lw = hall(c) ? low(c) : benchN(c) >= NUM.CLUB_BENCH;   // (playa: con un solo banquillo no)
    if (!(lw || l.mood >= NUM.CLUB_MOOD)) return false;
    if (!(age <= NUM.AGE_CLUB || l.mood >= NUM.CLUB_MOOD)) return false;
    if (at === 'end' && ((c.contract.left | 0) < 2 || (c.review && c.review.renew))) return false;
    return rng(c, 'ln-club', c.season, at)() < (at === 'mid' ? NUM.P_CLUB_MID : NUM.P_CLUB_END);
  }
  function midWindow(c) {
    var l = ensure(c);
    l.midS = c.season; l.midAt = wk(c);
    if (l.on) return;
    if (injOut(c)) {   // de baja en la ventana: ni propuesta del club ni la cesión que pediste (se puede volver a pedir en verano)
      if (l.want && l.want.at === 'mid') { l.want = null; msg(c, 'club', 'Cesión aplazada', 'Estás de baja y en esta ventana no te podemos ceder. Recupérate; en verano lo hablamos otra vez.'); }
      return;
    }
    if (l.want && l.want.at === 'mid' && l.want.s === c.season) { var by = l.want.by; l.want = null; openOpts(c, 'mid', by); return; }
    if (clubWants(c, 'mid')) { l.clubS = c.season; openOpts(c, 'mid', 'club'); }
  }
  function onMatch(c, sum, f) {
    var l = ensure(c);
    if (l.opts.length && l.optAt === 'mid' && l.optK !== wk(c)) { l.opts = []; l.optAt = ''; }   // caducan al jugar
    if (l.want && l.want.at === 'mid' && l.want.s !== c.season) l.want = null;
    expireAsk(c);
    // jornada de baja (lesión o selección): fuera de la cuenta de banquillos de la cesión (c.stats.bench sí la suma)
    if (sum && sum.out && sum.bench) { var ss = num(sum.season) ? sum.season | 0 : c.season | 0; if (l.xbS !== ss) { l.xbS = ss; l.xb = 0; } l.xb++; }
    var skip = !sum || sum.review || sum.phase === 'off' || sum.out || (l.on && l.on.s !== c.season);   // (de baja: sin malestar)
    if (!skip) moodStep(c, sum);
    if (l.on && l.on.s === c.season && sum && sum.out && !sum.review) l.on.xo = (l.on.xo | 0) + 1;   // jornada de baja: fuera de la nota
    // ventana de mitad: el partido que lleva la liga de antes de la jornada de mitad a ella (o más allá, con descansos)
    var mw = midW(c);
    if (f && f.kind === 'league' && sum && sum.phase === 'league' && c.phase === 'league' && (f.week | 0) < mw && (c.week | 0) >= mw && l.midS !== c.season) midWindow(c);
  }

  // ------------------------------------------------------------------ vuelta de la cesión (hook 'postSeason' con l.on)
  function back(c) {
    var l = ensure(c), on = l.on; if (!on) return null;
    var home = on.home, hk = club(c, home.club), lk = club(c, on.club), g = grade(c, on), E = K(c);
    var hName = hk ? hk.name : 'tu club', lName = lk ? lk.name : on.name;
    var hl = Array.isArray(c.history) ? c.history : [], hst = hl[hl.length - 1];
    if (hst && hst.season === c.season && hst.club === on.club) hst.loan = { from: home.club, name: hName };
    c.myClub = home.club;
    c.contract = copy(home.contract); delete c.contract.loan;
    c.coach = clamp(Math.round((+home.coach || 50) + NUM.GRADE_COACH[g.letter]), 0, 100);
    if (hall(c)) {
      c.chem = Math.round((home.chem | 0) * 0.8);
      // (temporada entera: la plantilla guardada es de hace un año; null y el núcleo la rehace con newSq6)
      c.sq6 = on.len !== 'season' && obj(home.sq6) && home.sq6.club === home.club ? copy(home.sq6) : null;
      c.ln6 = null;
    } else {
      if (obj(home.mate)) { c.mate = copy(home.mate); c.mate.form = 0; }
      if (Array.isArray(home.squad)) c.squad = copy(home.squad);
    }
    c.joinWk = (c.season + 1) * 1000; delete c.coachD; c.broken = 0; c.listed = false;
    var promo = 0;
    if (g.letter === 'A' && roleIdx(c) === 0 && hk) { c.contract.role = ROLE_LV()[1]; c.contract.salary = Math.max(c.contract.salary | 0, sal(c, hk, 1, true)); promo = 1; }
    l.bonusS = g.letter === 'A' ? c.season : 0;
    var dc = c.coach - clampI(home.coach, 0, 100);
    if (c.review) {
      // review.move pasa a ser el de tu club (el mensaje de _endOffers y «Seguir en… (sube)»); el del club de la cesión, en review.loan.move
      var lmv = c.review.move | 0;
      c.review.move = homeMove(c, hk);
      c.review.loan = { club: on.club, name: lName, home: home.club, homeName: hName, grade: g.letter, n: g.n, nota: g.avg, coach: dc, promo: promo, len: on.len, move: lmv };
    }
    l.last = { s: c.season, club: on.club, name: lName, home: home.club, homeName: hName, grade: g.letter, n: g.n, nota: g.avg, J: g.J, coach: dc, promo: promo, len: on.len };
    l.log.push({ s: c.season, club: on.club, name: lName, len: on.len, grade: g.letter, n: g.n, nota: g.avg });
    l.log = l.log.slice(-NUM.LOG_MAX);
    l.on = null; l.mood = 0; l.run = 0; l.opts = []; l.optAt = ''; l.want = null; l.ask = null;
    try { E._endOffers(c); } catch (e) { try { console.error('CareerLoan endOffers', e); } catch (e2) { } }
    var head = g.n ? plural(g.n, 'partido', 'partidos') + ', nota media ' + dec(g.avg) + '. ' : '';
    msg(c, 'coach', 'Vuelves a ' + hName, head + GRADE_TXT[g.letter] + (promo ? ' Te has ganado un sitio: vuelves como titular.' : ''));
    return g;
  }
  /** Ascenso (+1), descenso (−1) o nada (0) del club hk en los movimientos del cierre (c.review.moves). */
  function homeMove(c, hk) {
    var mv = hk && c.review && Array.isArray(c.review.moves) ? c.review.moves.filter(function (m) { return m && m.id === hk.id; })[0] : null;
    if (!mv) return 0;
    try {
      if (hall(c)) { var E = K(c), Lt = E.league(mv.to, c), Lf = E.league(hk.lid, c); return Lt && Lf ? (Lt.lvl < Lf.lvl ? 1 : -1) : 0; }
      return mv.to > hk.lvl ? 1 : -1;
    } catch (e) { return 0; }
  }
  function postSeason(c) {
    var l = ensure(c);
    if (l.on) { back(c); return; }
    if (c.phase !== 'off') return;
    expireAsk(c);
    if (l.want && l.want.at === 'end') {
      var by = l.want.by; l.want = null;
      if (!c.contract || (c.contract.left | 0) < 2 || (c.review && c.review.renew)) msg(c, 'loan', 'Cesión: no puede ser', 'Se te acaba el contrato: no hay cesión. Primero decide si renuevas.');
      else openOpts(c, 'end', by);
      return;
    }
    if (clubWants(c, 'end')) { l.clubS = c.season; openOpts(c, 'end', 'club'); }
  }

  // ------------------------------------------------------------------ gancho del núcleo
  function hook(c, kind, a, b) {
    if (!c || kind === 'create' || kind === 'setup' || kind === 'sess') return;   // (crear no toca nada: ensure va al vuelo)
    if (kind === 'match') return onMatch(c, a, b);
    var l = ensure(c);
    if (kind === 'join') {
      if (a && a.loan) return;   // (ir cedido: lo prepara take)
      l.mood = 0; l.run = 0; l.opts = []; l.optAt = ''; l.want = null; l.ask = null;
      return;
    }
    if (kind === 'newSeason') {
      l.mood = Math.round(l.mood * 0.5); l.run = 0;
      if (!(l.on && l.on.s === c.season)) { l.opts = []; l.optAt = ''; }
      if (l.want && l.want.s < c.season) l.want = null;
      expireAsk(c);
    }
  }

  // ------------------------------------------------------------------ acciones (sobre una c ya cargada; las públicas guardan)
  function proposal(c) {
    var rl = roleIdx(c), me = myClub(c), off = c.phase === 'off', left = (c.contract.left | 0) - (off ? 1 : 0);
    var s = Math.max(c.contract.salary | 0, sal(c, me, rl + 1, off));
    return { k: 'renew', role: ROLE_LV()[rl + 1], salary: Math.round(s / 50) * 50, years: clampI(Math.max(2, left + 1), 2, 3), seg: seg(c) };
  }
  function lastSeason(c, y) { return (c.phase === 'off' ? c.season + 1 : c.season) + y - 1; }
  /** Pedir el traspaso: 'renew' | 'yes' | 'loan' | 'no' | '' (no se puede). */
  function askOn(c) {
    var l = ensure(c); if (askWhy(c)) return '';
    var sg = seg(c); l.seg = sg;
    var u = rng(c, 'ln-ask', c.season, sg)(), rl = roleIdx(c), me = myClub(c), gap = pOvr(c) - clubAvg(c, me), lw = low(c);
    if (rl < 2 && (imp(c) || gap >= 3) && c.coach >= 45 && u < clamp(0.55 + 0.05 * gap, 0.3, 0.8)) {
      var p = l.ask = proposal(c);
      msg(c, 'coach', 'Traspaso: mejor renueva', 'No te vas. Te queremos aquí: te ofrecemos renovar como ' + p.role.toLowerCase() + ', ' + plural(p.years, 'temporada', 'temporadas') + ', ' + eur(p.salary) + ' al mes. Piénsalo.');
      return 'renew';
    }
    if (l.mood >= NUM.WARN || c.broken === c.season || (c.contract.left | 0) <= 1 || c.coach < 30) {
      c.listed = true; c.coach = clampI(c.coach + NUM.ASK_COACH_YES, 0, 100); l.mood = clampI(l.mood + NUM.LIST_MOOD, 0, 100);
      msg(c, 'coach', 'Traspaso: de acuerdo', 'No quiero a nadie a disgusto. Te ponemos en la lista: escucharemos ofertas.');
      return 'yes';
    }
    var na = nextAt(c);
    if (rl === 0 && lw && !(na.at === 'end' && ((c.contract.left | 0) < 2 || (c.review && c.review.renew))) && cands(c, na.at).length) {
      l.ask = { k: 'loan', seg: sg };
      msg(c, 'coach', 'Traspaso: no, pero…', 'No te vendemos. Si lo que quieres es jugar, te buscamos una cesión.');
      if (na.now) openOpts(c, na.at, 'club'); else l.want = { by: 'club', at: na.at, s: c.season };
      return 'loan';
    }
    l.ask = { k: 'no', seg: sg };
    msg(c, 'coach', 'Traspaso: no', 'Eres parte del proyecto y no estás en venta. Gánate los minutos aquí.');
    return 'no';
  }
  /** Contestar al club: a = 'sign' | 'leave' (renovación), 'ok' | 'insist' (no o cesión). 'ok' | 'offers' | ''. */
  function answerOn(c, a) {
    var l = ensure(c), q = l.ask; if (!q) return '';
    var me = myClub(c), off = c.phase === 'off';
    if (q.k === 'renew' && a === 'sign') {
      var y = clampI(q.years, 1, 3);
      c.contract = { club: me.id, years: y, left: y + (off ? 1 : 0), role: q.role, salary: q.salary, since: c.season + (off ? 1 : 0) };
      if (c.review && c.review.renew) c.review.renew = null;
      c.coach = clampI(c.coach + NUM.RENEW_COACH, 0, 100); l.mood = clampI(l.mood + NUM.RENEW_MOOD, 0, 100); l.ask = null;
      msg(c, 'club', 'Contrato renovado', 'Firmado: ' + q.role.toLowerCase() + ' hasta la T' + lastSeason(c, y) + ', ' + eur(q.salary) + ' al mes. A seguir.');
      return 'ok';
    }
    if (q.k === 'renew' && a === 'leave') {
      c.listed = true; c.coach = clampI(c.coach + NUM.LISTED, 0, 100); l.mood = clampI(l.mood + NUM.LIST_MOOD, 0, 100); l.ask = null;
      msg(c, 'coach', 'Has pedido el traspaso', 'Entiendo que quieras irte, pero no me gusta. Tu agente ya avisa a los clubes: llegarán más ofertas' + (off ? '.' : ' (a mitad de temporada basta con una nota media más baja).'));
      return 'ok';
    }
    if (a === 'insist' && (q.k === 'no' || q.k === 'loan')) {
      c.listed = true; c.coach = clampI(c.coach + NUM.INSIST, 0, 100); l.mood = clampI(l.mood + NUM.LIST_MOOD, 0, 100);
      l.ask = null; if (q.k === 'loan') { l.want = null; if (l.optBy === 'club') { l.opts = []; l.optAt = ''; } }
      msg(c, 'coach', 'Te has plantado', 'Has insistido. El club te pone en la lista, pero el vestuario lo ha notado.');
      return 'ok';
    }
    if (a === 'ok' && q.k === 'no') {
      c.coach = clampI(c.coach + NUM.NO_OK, 0, 100); l.ask = null;
      msg(c, 'coach', 'A pelear el sitio', 'Lo entiendo. A pelear el sitio. Te estaré mirando en los entrenos.');
      return 'ok';
    }
    if (a === 'ok' && q.k === 'loan') { l.ask = null; return l.opts.length ? 'offers' : 'ok'; }
    return '';
  }
  /** Pedir una cesión: 'ok' (salen ya) | 'wait' (en la próxima ventana) | 'none' (sin destino) | 'no' (el club no te deja) | ''. */
  function askLoanOn(c) {
    var l = ensure(c); if (loanWhy(c)) return '';
    var sg = seg(c), rl = roleIdx(c); l.seg = sg;
    if (!(low(c) || rl === 0 || l.mood >= NUM.WARN)) { msg(c, 'coach', 'Cesión: no', 'Eres importante aquí. Ahora no te dejamos salir.'); return 'no'; }
    var na = nextAt(c);
    if (na.now) return openOpts(c, na.at, 'me') ? 'ok' : 'none';
    l.want = { by: 'me', at: na.at, s: c.season };
    if (na.at === 'mid') msg(c, 'club', 'Cesión: de acuerdo', 'De acuerdo. Te buscamos equipo para la ventana de la jornada ' + midW(c) + '.');
    else msg(c, 'club', 'Cesión: en verano', 'Ya no hay ventana. Lo miramos al acabar la temporada.');
    return 'wait';
  }
  /** Ir cedido con la opción i: 'ok' | 'none' (caducada) | ''. */
  function takeOn(c, i, force) {
    var l = ensure(c), o = l.opts[i | 0], E = K(c); if (!o || l.on || !c.contract) return '';
    if (injOut(c) && !force) return '';   // (de baja no te vas cedido; las cesiones siguen ahí hasta que caduquen)
    var at = l.optAt, mid = at === 'mid';
    if ((mid && !midOpen(c)) || (!mid && !endOpen(c))) { l.opts = []; l.optAt = ''; return 'none'; }
    if (!mid && ((c.contract.left | 0) < 2 || (c.review && c.review.renew))) return 'none';
    var hk = myClub(c), lk = club(c, o.club); if (!hk || !lk) return '';
    var home = { club: hk.id, name: hk.name, contract: copy(c.contract), coach: c.coach | 0, listed: false };
    if (hall(c)) { home.chem = c.chem | 0; home.sq6 = obj(c.sq6) ? copy(c.sq6) : null; }
    else { home.mate = copy(c.mate); home.squad = copy(c.squad || []); }
    if (!mid) home.contract.left = (home.contract.left | 0) - 1;   // (la temporada de la cesión cuenta en tu contrato)
    delete home.contract.loan;
    l.on = { club: lk.id, name: lk.name, len: mid ? 'half' : 'season', s: mid ? c.season : c.season + 1, home: home, n0: mid ? (c.notes || []).length : 0, b0: mid ? bOf(c) : zeros() };
    var oo = copy(o); oo.loan = 1; oo.salary = home.contract.salary; oo.role = ROLE_LV()[1]; delete oo.trial; delete oo.early; delete oo.negNo;
    if (mid) { E._joinClub(c, oo, 1); c.contract.salary = home.contract.salary; c.contract.loan = 1; c.last = null; }
    else { E._newSeason(c, oo, 1); c.contract.salary = home.contract.salary; c.contract.loan = 1; }
    l.opts = []; l.optAt = ''; l.want = null; l.ask = null; c.listed = false; l.mood = 0; l.run = 0;
    msg(c, 'loan', 'Cedido a ' + lk.name, 'Juegas en ' + lk.name + (mid ? ' hasta final de temporada' : ' toda la temporada ' + c.season) + '. Cobras lo mismo y vuelves a ' + hk.name + ' en verano.');
    return 'ok';
  }
  /** «No, gracias» a las cesiones. */
  function passOn(c) {
    var l = ensure(c); if (!l.opts.length) return '';
    var by = l.optBy; l.opts = []; l.optAt = '';
    if (by === 'club') { c.coach = clampI(c.coach + NUM.PASS_CLUB, 0, 100); msg(c, 'coach', 'Cesión: no', 'Lo entiendo. Aquí sigues.'); }
    return 'ok';
  }

  // ------------------------------------------------------------------ API pública (carrera activa; guardan)
  function cur() { var C = VB.Career; return C && C.get ? C.get() : null; }
  function withC(f) { return function () { var c = cur(); if (!c) return ''; var r = f.apply(null, [c].concat(Array.prototype.slice.call(arguments))); if (r) K(c).save(c); return r; }; }
  function info(c) {
    c = c || cur(); if (!c) return null;
    var l = ensure(c), mv = moodLv(l.mood);
    return { mood: l.mood, moodName: mv.name, moodTag: mv.tag, canAsk: !askWhy(c), askWhy: askWhy(c), canLoan: !loanWhy(c), loanWhy: loanWhy(c), ask: l.ask, opts: l.opts,
      optAt: l.optAt, optBy: l.optBy, want: l.want, on: l.on, last: l.last, log: l.log, midOpen: midOpen(c), seg: seg(c), grade: l.on ? grade(c, l.on) : null };
  }

  // ------------------------------------------------------------------ pantallas (HTML; las pinta career-ui con HLP)
  function fact(H, label, val) { return '<div><small>' + H.esc(label) + '</small><b>' + val + '</b></div>'; }
  function meter(v, label, col) { return '<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + v + '" aria-label="' + label + '"><i style="width:' + v + '%;background:' + col + '"></i></div>'; }
  function btn(act, label, o) {
    o = o || {};
    return '<button' + (o.cls ? ' class="' + o.cls + '"' : '') + ' data-act="' + act + '"' + (o.a ? ' data-a="' + o.a + '"' : '') + (o.i != null ? ' data-i="' + o.i + '"' : '') + (o.t ? ' data-t="' + o.t + '"' : '') +
      (o.on != null ? ' data-on="' + o.on + '"' : '') + (o.off ? ' aria-disabled="true"' : '') + (o.title ? ' title="' + o.title + '"' : '') + '>' + label + '</button>';
  }
  function help(H, title, text) { return H.ph && H.ph() && H.q ? H.q(title, text) : '<p class="muted">' + H.esc(text) + '</p>'; }
  var MOOD_HELP = 'El malestar sube cuando no juegas (fuera de la convocatoria, en el banquillo o solo unos puntos) y baja cuando sales de inicio. No cambia nada en el campo. Con 45 o más, el club escucha mejor si pides salir.';
  var LOAN_HELP = 'Juegas cedido en un club más pequeño, de titular. Te quedas tu sueldo y tu contrato. Al acabar la temporada vuelves solo y el entrenador valora la cesión: A, B, C o D.';
  function lgName(c, o) { try { var L = hall(c) ? K(c).league(o.lid, c) : K(c).league(o.lvl); return L ? L.name : ''; } catch (e) { return ''; } }
  function logLine(c, H) {
    var l = ensure(c); if (!l.log.length) return '';
    return '<p class="muted">' + H.sp(['Cesiones'].concat(l.log.slice(-4).map(function (x) {
      return H.esc('T' + x.s + ' ' + x.name + ' (' + (x.len === 'season' ? 'temporada' : 'media temporada') + '): ' + x.grade);
    })), 'v') + '</p>';
  }
  /** Club › Contrato: sustituye la tarjeta «Traspaso». */
  function uiTransfer(c, H) {
    if (!c || !c.contract || c.phase === 'pick') return '';
    var l = ensure(c);
    if (l.on) return uiOn(c, H);
    var mv = moodLv(l.mood), aw = askWhy(c), lw = loanWhy(c), h = '<div class="card"><h3>' + H.sp(['Minutos y salida', H.esc(mv.name)], 'd') + '</h3>' + help(H, 'Malestar', MOOD_HELP) +
      meter(l.mood, 'Malestar', mv.col) + '<p class="muted">' + H.sp(['Malestar ' + l.mood + ' de 100', '<span class="tag ' + mv.tag + '">' + H.esc(mv.name) + '</span>'], 'v') + '</p>';
    var acts = c.listed ? btn('transfer', 'Retirar la petición', { on: 0 }) : btn('ln-ask', 'Pedir el traspaso', { cls: 'warn', off: !!aw });
    acts += btn('ln-loan', 'Pedir una cesión', { off: !!lw });
    if (c.listed) h += '<p>Estás en la lista de transferibles: llegan más ofertas.</p>';
    h += '<div class="acts">' + acts + '</div>';
    var lc = function (t) { return t.charAt(0).toLowerCase() + t.slice(1); };
    var why = [!c.listed && aw && !/Contesta/.test(aw) ? 'Traspaso: ' + lc(aw) : '', lw && !/Contesta/.test(lw) ? 'Cesión: ' + lc(lw) : ''].filter(Boolean);
    if (why.length) h += '<p class="muted">' + H.sp(why.map(H.esc), 'v') + '</p>';
    h += logLine(c, H) + '</div>';
    return h + uiAsk(c, H);
  }
  /** Respuesta pendiente del club a tu petición. */
  function uiAsk(c, H) {
    var l = ensure(c), q = l.ask; if (!q) return '';
    var ph = !!(H.ph && H.ph());
    if (q.k === 'renew' && ph) {   // móvil: la propuesta arriba en una tira con lo que cambia en verde / rojo; sin sello
      var ct = c.contract || {}, R = ROLE_LV(), dR = R.indexOf(q.role) - R.indexOf(ct.role), dS = (q.salary | 0) - (ct.salary | 0);
      var cl = function (d) { return d > 0 ? ' ln-up' : d < 0 ? ' ln-dn' : ''; };
      return '<div class="card new x-go ln-ask"><p class="ln-ak"><b>Renovación:</b> no te vende, te ofrece un rol más.</p>' +
        '<div class="sp-heros sp-sm ph-strip ln-st"><div class="sp-hero' + cl(dR) + '"><span class="sp-hn">' + H.esc(q.role) + '</span><span class="sp-hl">Rol' + (dR > 0 ? ' ▲' : dR < 0 ? ' ▼' : '') + '</span></div>' +
        '<div class="sp-hero"><span class="sp-hn">' + (q.years | 0) + '</span><span class="sp-hl">' + (q.years === 1 ? 'Temporada' : 'Temporadas') + '</span></div>' +
        '<div class="sp-hero' + cl(dS) + '"><span class="sp-hn">' + H.esc(eur(q.salary)) + '</span><span class="sp-hl">Al mes' + (dS ? ' (' + (dS > 0 ? '+' : '−') + H.esc(eur(Math.abs(dS))) + ')' : '') + '</span></div></div>' +
        '<div class="acts">' + btn('ln-ans', 'Firmar', { cls: 'pri', a: 'sign' }) + btn('ln-ans', 'Prefiero salir', { a: 'leave' }) + '</div>' +
        '<p class="muted ln-ac">Prefiero salir: lista de transferibles (−8 de confianza).</p></div>';
    }
    if (q.k === 'no' && ph) {   // móvil: el mensaje del club en una franja y la consecuencia de Insistir en pequeño
      return '<div class="card new x-go ln-ask"><p class="ln-ak"><b>El club dice que no:</b> no estás en venta.</p>' +
        '<div class="acts">' + btn('ln-ans', 'Aceptarlo', { cls: 'pri', a: 'ok' }) + btn('ln-ans', 'Insistir', { a: 'insist' }) + '</div>' +
        '<p class="muted ln-ac">' + H.sp(['Aceptarlo: +2 de confianza', 'Insistir: transferible y −12'], 'v') + '</p></div>';
    }
    if (q.k === 'renew') {
      return '<div class="card new x-go"><h3>' + H.sp(['El club contesta', 'Renovar'], 'd') + '</h3><p>No te vende: te ofrece renovar con un rol más.</p><div class="fact">' +
        fact(H, 'Rol', H.esc(q.role)) + fact(H, 'Años', plural(q.years, 'temporada', 'temporadas')) + fact(H, 'Sueldo', H.esc(eur(q.salary)) + ' al mes') + '</div>' +
        '<div class="acts">' + btn('ln-ans', 'Firmar', { cls: 'pri', a: 'sign' }) + btn('ln-ans', 'Prefiero salir', { a: 'leave' }) + '</div>' +
        '<p class="muted">Si prefieres salir, entras en la lista de transferibles (−8 de confianza).</p></div>';
    }
    if (q.k === 'no') {
      return '<div class="card new x-go"><h3>' + H.sp(['El club contesta', 'No'], 'd') + '</h3><p>El club dice que no: no estás en venta.</p>' +
        '<div class="acts">' + btn('ln-ans', 'Aceptarlo', { cls: 'pri', a: 'ok' }) + btn('ln-ans', 'Insistir', { cls: 'warn', a: 'insist' }) + '</div>' +
        '<p class="muted">' + H.sp(['Aceptarlo: +2 de confianza', 'Insistir: lista de transferibles y −12 de confianza'], 'v') + '</p></div>';
    }
    var has = l.opts.length > 0;
    return '<div class="card new x-go"><h3>' + H.sp(['El club contesta', 'Cesión'], 'd') + '</h3><p>No te vende, pero te cede.' + (has ? '' : ' Te busca equipo para la próxima ventana.') + '</p>' +
      '<div class="acts">' + (has ? btn('ln-go', 'Ver cesiones', { cls: 'pri', t: 'offers' }) : btn('ln-ans', 'De acuerdo', { cls: 'pri', a: 'ok' })) + btn('ln-ans', 'Insistir', { cls: 'warn', a: 'insist' }) + '</div>' +
      '<p class="muted">Insistir: lista de transferibles y −12 de confianza.</p></div>';
  }
  /** Club › Contrato mientras estás cedido. */
  function uiOn(c, H) {
    var l = ensure(c), on = l.on, k = club(c, on.club), hk = club(c, on.home.club), g = grade(c, on) || { n: 0, avg: null, out: 0, letter: 'D' };
    if (H.ph && H.ph()) {   // móvil (movil-aire §5.3): sello «Cedido» a secas, las 4 cifras en una tira y «Vuelves a…» en una línea con «?»
      return '<div class="card x-top ln-on6"><h3>Cedido</h3>' + help(H, 'Cesión', LOAN_HELP + ' No recibes ofertas mientras estás cedido.') + '<div class="row">' + (H.crest ? H.crest(k, 44) : '') +
        '<div class="grow" style="min-width:0"><p class="bigname ln-on">' + H.esc(k ? k.name : on.name) + '</p><p class="muted ln-om">' +
        H.sp([on.len === 'season' ? 'Toda la temporada' : 'Hasta el final', H.esc('Vuelves a ' + (hk ? (H.shortClub ? H.shortClub(hk) : hk.name) : on.home.name))], 'v') + '</p></div></div>' +
        '<div class="sp-heros sp-sm ph-strip ln-st">' + [[g.n, 'Partidos'], [dec(g.avg), 'Nota'], [g.out, 'Sin jugar'], [g.n >= 2 ? g.letter : '—', 'Vas para']].map(function (x) {
          return '<div class="sp-hero"><span class="sp-hn">' + x[0] + '</span><span class="sp-hl">' + x[1] + '</span></div>'; }).join('') + '</div><p class="muted ln-om">No recibes ofertas mientras estás cedido.</p>' + logLine(c, H) + '</div>';
    }
    var h = '<div class="card x-top"><h3>' + H.sp(['Cedido', H.esc(on.name)], 'd') + '</h3><div class="row">' + (H.crest ? H.crest(k, 48) : '') +
      '<div class="grow" style="min-width:0"><p class="bigname" style="font-size:18px">' + H.esc(k ? k.name : on.name) + '</p><p class="muted" style="margin:2px 0 0">' +
      H.sp([on.len === 'season' ? 'Toda la temporada' : 'Hasta final de temporada', H.esc('Vuelves a ' + (hk ? hk.name : on.home.name))], 'v') + '</p></div></div>' +
      '<div class="fact">' + fact(H, 'Partidos', g.n) + fact(H, 'Nota media', dec(g.avg)) + fact(H, 'Jornadas sin jugar', g.out) + fact(H, 'Vas para', g.n >= 2 ? g.letter : '—') + '</div>' +
      help(H, 'Cesión', LOAN_HELP) + '<p class="muted">No recibes ofertas mientras estás cedido.</p>' + logLine(c, H) + '</div>';
    return h;
  }
  /** Club › Ofertas: las cesiones para elegir (antes de la tarjeta de ofertas). */
  function uiOffers(c, H) {
    var l = ensure(c); if (!l.opts.length) return '';
    var mid = l.optAt === 'mid', inj = injOut(c), ph = !!(H.ph && H.ph());
    if (ph) {   // móvil (movil-aire §5.3): el bloqueo como ficha roja arriba, ofertas de una fila con «Ir cedido» a la derecha y las condiciones en una tira
      var hp = '<div class="card new ln-ph"><h3>' + H.sp(['Cesiones', mid ? 'Hasta el final' : 'Temporada que viene'], 'd') + '</h3>' + help(H, 'Cesiones', LOAN_HELP + ' ' + (mid ? 'Caducan al jugar o simular el siguiente partido.' : 'Caducan al empezar la temporada.')) +
        (inj ? '<p class="ln-why"><span class="tag r">Estás de baja</span> No puedes irte cedido hasta que te recuperes.</p>' : '') +
        '<p class="ln-cond">' + H.sp(['Titular', 'Tu sueldo', mid ? 'Hasta final de temporada' : 'Una temporada', mid ? 'Caducan al jugar' : 'Caducan en verano'], 'c') + '</p>';
      l.opts.forEach(function (o, i) {
        var k = club(c, o.club); if (!k) return;
        var tg = hall(c) ? (o.depth && o.depth.start ? '<span class="tag g">De inicio</span>' : '<span class="tag y">Pelearás el sitio</span>') : o.mateP ? '<span class="tag">Pareja ' + H.esc(String(o.mateP.name).split(' ')[0]) + ', ' + o.mate + '</span>' : '';
        // (ronda 2, recortes: nombre corto del club y el largo debajo; los datos en 2 líneas; «Ir cedido» debajo a la derecha)
        var kn = H.shortClub ? H.shortClub(k) : k.name;
        hp += '<div class="offer-x ln-o"><div class="row">' + (H.crest ? H.crest(k, 40) : '') + '<div class="grow" style="min-width:0"><p class="bigname ln-on">' + H.esc(kn) + '</p>' +
          (kn !== k.name ? '<p class="muted ln-ol">' + H.esc(k.name) + '</p>' : '') +
          '<p class="muted ln-om"><span class="ln-l">' + H.sp([H.esc(lgName(c, o)), 'Media ' + o.ovr], 'v') + '</span><span class="ln-l">' + H.esc(eur(o.salary)) + '/mes ' + tg + '</span></p></div>' +
          '<div class="acts">' + btn('ln-take', 'Ir cedido', { i: i, off: inj, title: inj ? 'Estás de baja' : '' }) + '</div></div></div>';
      });
      return hp + '<div class="acts ln-pass">' + btn('ln-pass', 'No, gracias') + '</div></div>';
    }
    var h = '<div class="card new"><h3>' + H.sp(['Cesiones', mid ? 'Hasta final de temporada' : 'Toda la temporada que viene'], 'd') + '</h3>' + help(H, 'Cesiones', LOAN_HELP);
    l.opts.forEach(function (o, i) {
      var k = club(c, o.club); if (!k) return;
      h += '<div class="offer-x" style="padding:8px 0;border-top:1px solid var(--sep)"><div class="row">' + (H.crest ? H.crest(k, 40) : '') + '<div class="grow" style="min-width:0"><p class="bigname" style="font-size:18px">' +
        H.esc(k.name) + '</p><p class="muted" style="margin:2px 0 0">' + H.sp([H.esc(lgName(c, o)), 'Media ' + o.ovr], 'v') + '</p></div></div><p style="margin:6px 0">';
      if (hall(c)) h += o.depth && o.depth.start ? '<span class="tag g">Juegas de inicio</span>' : '<span class="tag y">Pelearás el sitio</span>';
      else if (o.mateP) h += H.sp(['Pareja: ' + H.esc(o.mateP.name), 'Media ' + o.mate], 'c');
      h += '</p><p class="muted" style="margin:0 0 6px">' + H.sp(['Titular', 'Cobras ' + H.esc(eur(o.salary)) + ' al mes', mid ? 'Hasta final de temporada' : 'Una temporada'], 'v') + '</p>' +
        '<div class="acts">' + btn('ln-take', 'Ir cedido', { i: i, off: inj, title: inj ? 'Estás de baja' : '' }) + '</div></div>';
    });
    if (inj) h += '<p class="muted">Estás de baja: no puedes irte cedido hasta que te recuperes.</p>';
    h += '<div class="acts">' + btn('ln-pass', 'No, gracias') + '</div><p class="muted">' + (mid ? 'Caducan al jugar o simular el siguiente partido.' : 'Caducan al empezar la temporada.') + '</p></div>';
    return h;
  }
  /** Partido: un aviso corto si hay algo que hacer (cesiones abiertas o una renovación sobre la mesa). */
  function uiMatch(c, H) {
    var l = ensure(c); if (!c || c.phase === 'off' || c.phase === 'pick') return '';
    if (l.opts.length) return '<div class="card new"><h3>' + (l.opts.length === 1 ? '1 cesión para elegir' : l.opts.length + ' cesiones para elegir') + '</h3><p class="muted">Caducan al jugar.</p><div class="acts">' + btn('ln-go', 'Ver cesiones', { t: 'offers' }) + '</div></div>';
    if (l.ask && l.ask.k === 'renew') return '<div class="card new"><h3>El club te ofrece renovar</h3><p class="muted">' + H.sp([H.esc(l.ask.role), H.esc(eur(l.ask.salary)) + ' al mes'], 'v') + '</p><div class="acts">' + btn('ln-go', 'Verla', { t: 'contract' }) + '</div></div>';
    return '';
  }
  /** Fin de temporada: la valoración de la cesión y, si hay, las cesiones del verano. */
  function uiSeasonEnd(c, H) {
    var l = ensure(c), r = c.review || {}, x = r.loan, h = '';
    if (x) {
      var tg = x.grade === 'A' ? 'g' : x.grade === 'D' ? 'r' : x.grade === 'B' ? 'y' : '';
      h += '<div class="card new ln-end"><h3>' + H.sp(['Fin de la cesión', 'Nota ' + x.grade], 'd') + '</h3><p>' + H.esc('Vuelves a ' + x.homeName + '. ' + GRADE_TXT[x.grade]) + '</p><div class="fact">' +
        fact(H, 'Partidos', x.n | 0) + fact(H, 'Nota media', dec(x.nota)) + fact(H, 'Confianza', (x.coach > 0 ? '+' : x.coach < 0 ? '−' : '±') + Math.abs(x.coach | 0)) + '</div>' +
        '<p><span class="tag ' + tg + '">' + H.esc('Cesión en ' + x.name + ': ' + x.grade) + '</span>' + (x.promo ? '<span class="tag g">Vuelves como titular</span>' : '') +
        (x.move > 0 ? '<span class="tag g">' + H.esc(x.name + ' asciende') + '</span>' : x.move < 0 ? '<span class="tag r">' + H.esc(x.name + ' desciende') + '</span>' : '') + '</p></div>';
    }
    if (l.opts.length && l.optAt === 'end') h += '<div class="card new"><h3>' + H.sp(['Cesiones', 'Temporada que viene'], 'd') + '</h3><p class="muted">' + (l.opts.length === 1 ? 'Un club te quiere' : l.opts.length + ' clubes te quieren') + ' de titular toda la temporada.</p><div class="acts">' + btn('ln-go', 'Ver cesiones', { t: 'offers' }) + '</div></div>';
    return h;
  }
  function dot(c, where) {
    if (!c || !c.loan) return false;
    var l = ensure(c);
    if (where === 'club') return l.opts.length > 0 || !!l.ask;
    if (where === 'offers') return l.opts.length > 0;
    if (where === 'contract') return !!l.ask;
    return false;
  }
  function act(a, b) {
    if (b && b.getAttribute && b.getAttribute('aria-disabled') === 'true') return false;
    var ga = function (k) { return b && b.getAttribute ? b.getAttribute(k) : null; };
    if (a === 'ln-go') return ga('data-t') === 'contract' ? { tab: 'club', s: 'contract', focus: '[data-act="ln-ans"]' } : { tab: 'club', s: 'offers', focus: '[data-act="ln-take"]' };
    if (a === 'ln-ask') { var r = API.askTransfer(); return r ? { render: true, focus: r === 'yes' ? '[data-act="transfer"]' : r === 'loan' && ensure(cur()).opts.length ? '[data-act="ln-go"]' : '[data-act="ln-ans"]' } : false; }
    if (a === 'ln-loan') { var rl = API.askLoan(); return rl ? (rl === 'ok' ? { tab: 'club', s: 'offers', focus: '[data-act="ln-take"]' } : { render: true, focus: '[data-act="ln-loan"]' }) : false; }
    if (a === 'ln-ans') { var ra = API.answer(ga('data-a')); return ra === 'offers' ? { tab: 'club', s: 'offers', focus: '[data-act="ln-take"]' } : ra ? { render: true, focus: '[data-act="ln-ask"], [data-act="transfer"], [data-act="ln-loan"]' } : false; }
    if (a === 'ln-take') { var rt = API.take(+ga('data-i') || 0); return rt === 'ok' ? { tab: 'club', s: 'contract', snd: 'select' } : rt ? { render: true } : false; }
    if (a === 'ln-pass') { return API.pass() ? { render: true } : false; }
    return null;
  }

  // ------------------------------------------------------------------ pantallas de muestra (mobaudit)
  /** Prepara la pantalla tipo ('opts', 'renew', 'no', 'on', 'back') sobre la carrera c y guarda. true si ha quedado lista. */
  function demo(c, tipo) {
    c = c || cur(); if (!c || !c.contract || c.phase === 'pick') return false;
    var l = ensure(c), E = K(c);
    // (mobaudit repite la fila en cada tamaño sobre la misma carrera: cada tipo tiene que poder prepararse otra vez)
    var openMid = function () {
      var at = c.phase === 'off' ? 'end' : 'mid';
      if (at === 'mid') l.midAt = wk(c);
      l.opts = cands(c, at); if (!l.opts.length) l.opts = demoCands(c, at);
      l.optAt = at; l.optBy = 'club'; l.optK = wk(c); return l.opts.length > 0;
    };
    if (l.on && (tipo === 'opts' || tipo === 'renew' || tipo === 'no')) demoUndo(c);
    if (tipo === 'opts') { if (!openMid()) return false; }
    else if (tipo === 'renew') { if (roleIdx(c) >= 2) c.contract.role = ROLE_LV()[1]; l.ask = proposal(c); }
    else if (tipo === 'no') l.ask = { k: 'no', seg: seg(c) };
    else if (tipo === 'back' && c.phase === 'off' && c.review && c.review.loan) { /* ya está */ }
    else if (tipo === 'back' && c.phase === 'off') { if (!demoBack(c)) return false; }   // (otra muestra la dejó en verano sin cesión)
    else if (tipo === 'on' || tipo === 'back') {
      if (c.phase === 'off') return false;
      if (!l.on) { if (!openMid() || takeOn(c, 0, true) !== 'ok') return false; }   // (true: también de baja, p. ej. tras la muestra de lesión)
      var g = 0;
      if (tipo === 'on') { if ((c.notes || []).length <= l.on.n0) for (var i = 0; i < 2 && c.phase !== 'off'; i++) E.simulateNext(c); }
      else { while (c.phase !== 'off' && g++ < 60) E.simulateNext(c); if (c.phase !== 'off') return false; }
    } else return false;
    E.save(c);
    return true;
  }
  /** (solo muestras) En verano sin cesión: la valoración de una cesión de media temporada ya acabada (review.loan y last), sin
   *  tocar club, contrato ni ofertas. Para la tarjeta «Fin de la cesión». */
  function demoBack(c) {
    var l = ensure(c), me = myClub(c); if (!c.review || !me) return false;
    var k = c.clubs.filter(function (x) { return x && x.id !== me.id && (hall(c) ? x.lid === me.lid : x.lvl === me.lvl); })
      .sort(function (a, b) { return clubAvg(c, a) - clubAvg(c, b) || a.id - b.id; })[0];
    if (!k) return false;
    var x = { club: k.id, name: k.name, home: me.id, homeName: me.name, grade: 'B', n: 6, nota: hall(c) ? 5.6 : 6.2, coach: NUM.GRADE_COACH.B, promo: 0, len: 'half', move: 0 };
    c.review.loan = x;
    l.last = { s: c.season, club: k.id, name: k.name, home: me.id, homeName: me.name, grade: 'B', n: 6, nota: x.nota, J: 7, coach: x.coach, promo: 0, len: 'half' };
    if (!l.log.some(function (y) { return y.s === c.season && y.club === k.id; })) l.log.push({ s: c.season, club: k.id, name: k.name, len: 'half', grade: 'B', n: 6, nota: x.nota });
    return true;
  }
  /** (solo muestras) Deshace una cesión de muestra en curso: vuelves al club de origen tal cual. */
  function demoUndo(c) {
    var l = ensure(c), h = l.on && l.on.home; if (!h) return;
    c.myClub = h.club; c.contract = copy(h.contract); c.coach = h.coach | 0;
    if (hall(c)) { var hk = club(c, h.club); c.chem = h.chem | 0; c.sq6 = obj(h.sq6) ? copy(h.sq6) : null; c.ln6 = null; if (hk) c.myRes = { lid: hk.lid, w: [] }; }
    else { if (obj(h.mate)) c.mate = copy(h.mate); if (Array.isArray(h.squad)) c.squad = copy(h.squad); }
    l.on = null;
  }
  /** (solo muestras) Si ningún club encaja con las reglas, los 3 más flojos de tu liga. */
  function demoCands(c, at) {
    var me = myClub(c), out = [], len = at === 'end' ? 'season' : 'half';
    c.clubs.filter(function (k) { return k.id !== me.id && (hall(c) ? k.lid === me.lid : k.lvl === me.lvl); }).sort(function (a, b) { return clubAvg(c, a) - clubAvg(c, b); }).slice(0, 3).forEach(function (k) {
      out.push(hall(c) ? { club: k.id, lid: k.lid, cc: k.cc, ovr: k.ovr, role: ROLE_LV()[1], years: 1, salary: c.contract.salary | 0, loan: 1, len: len, depth: { start: true, gap: 1, rank: 1, slots: 1 } }
        : { club: k.id, lvl: k.lvl, ovr: clubAvg(c, k), q: k.q, mate: clubAvg(c, k), mateP: null, role: ROLE_LV()[1], years: 1, salary: c.contract.salary | 0, loan: 1, len: len });
    });
    return out;
  }

  // ------------------------------------------------------------------ registro
  var API = {
    NUM: NUM, MOOD: MOOD, GRADES: GRADES, ensure: ensure, info: info, grade: grade, cands: cands, seg: seg, midOpen: midOpen, moodLevel: moodLv, ordn: ordn,
    askTransfer: withC(askOn), answer: withC(answerOn), askLoan: withC(askLoanOn), take: withC(takeOn), pass: withC(passOn),
    // sobre una c ya cargada, sin guardar (pruebas)
    _ask: askOn, _answer: answerOn, _askLoan: askLoanOn, _take: takeOn, _pass: passOn, _back: back, _openOpts: openOpts, _hook: hook, _low: low, _benchN: benchN, _clubWants: clubWants, _injOut: injOut,
    _demo: demo,   // (c, tipo), como CareerExt._demo; c null = la carrera activa
    ui: { transfer: uiTransfer, offers: uiOffers, match: uiMatch, seasonEnd: uiSeasonEnd, ask: uiAsk, on: uiOn }
  };
  VB.CareerLoan = API;
  (VB.CareerExt = VB.CareerExt || []).push({
    id: 'loan', hook: hook,
    offerBonus: function (c) { var l = c && c.loan; return l && l.bonusS === c.season && c.phase === 'off' ? NUM.BONUS_A : 0; },
    midOffers: function (c) { return !!(c && c.loan && c.loan.on && ensure(c).on); },
    holdOffers: function (c) { return !!(c && c.loan && c.loan.on && ensure(c).on); },
    postSeason: postSeason,
    _demo: demo
  });
  (VB.CareerUIExt = VB.CareerUIExt || []).push({
    id: 'loan', prefix: 'ln-',
    replace: { transfer: uiTransfer },
    offers: uiOffers, match: uiMatch, seasonEnd: uiSeasonEnd,
    dot: dot, act: act, msgK: { loan: 'Cesión' }
  });
})();
