/* TAKE THE COURT — js/career-dev.js (owner: puesto)
 * Cambio de puesto y plan de desarrollo (VB.CareerDev), para las dos Carreras (playa y pista).
 * API de extensiones de la Carrera: CONTRACT.md «Extensiones de la Carrera» (VB.CareerExt, VB.CareerUIExt). Pruebas: tools/devtest.js.
 *
 * 1) CAMBIO DE PUESTO. El entrenador te propone a veces cambiar de puesto (como mucho N.POS_MAX_S por temporada, con N.POS_P por
 *    jornada cuando hay motivo: puntuación ≥ N.POS_MIN). Mira:
 *    - el ENCAJE de tus atributos con cada puesto: fitN(p) = Σ off[k]·(st[k] − media) / √Σ off[k]² (off = perfil del puesto: POS6 en
 *      la pista, ROLES en la playa). En pantalla, «Encaje 71 %» = 50 + 50 × tanh(fitN / 15) (0-100);
 *    - lo que necesita el equipo. Pista: tu sitio en la plantilla de cada puesto (squad6, determinista; tu media + meEdge contra la de
 *      los compañeros del puesto: la distancia con el último titular y los que tienes delante hasta el seis). Playa: si tu pareja
 *      rinde más en el otro papel;
 *    - pista: si ahora no sales de inicio (+2 suplente, +3 fuera, +N.BENCH_W por jornada seguida sin salir de inicio, hasta
 *      N.BENCH_MAX). Perder hasta N.FIT_TOL de encaje no cuenta (polivalencia), y un cambio que encaja peor solo se propone si allí
 *      el sitio está más a mano (necesidad ≥ 1): el mensaje nunca promete minutos que no hay.
 *    Llega con un mensaje del entrenador y una tarjeta en Partido (Aceptar / Rechazar, N.POS_EXP jornadas para contestar).
 *    - Aceptar: confianza +N.ACC_COACH; pista: K(c)._setPos (plantilla del puesto nuevo); playa: tu pareja pasa al otro papel (la
 *      química no cambia). Adaptación: N.ADAPT jornadas con −N.ADAPT_D en los 2 atributos clave del puesto nuevo, solo en los partidos
 *      jugados (life 'setup'; el simulado no lee atributos, como las molestias de career-life). Si no tenías plan, el entrenador te deja
 *      uno del puesto nuevo (REC).
 *    - Rechazar: −N.REJ_COACH (−N.REJ_COACH_HI si la confianza es ≥ N.REJ_HI); el 2º de la temporada, −N.REJ2_COACH y no vuelve a
 *      proponerlo hasta la siguiente. Sin contestar: caduca sin efecto.
 *    - Pedirlo tú (Jugador › Estado): una vez cada N.ASK_WAIT jornadas; en verano siempre sí (una vez por verano, adaptación corta);
 *      de Rotación con confianza < N.ASK_COACH, no; si no, probabilidad askChance (5-90 %). Un «no» cuesta −N.ASK_NO_COACH.
 * 2) PLAN DE DESARROLLO (Jugador › Estado): N.PLAN_LEN jornadas centrado en Ataque, Recepción, Bloqueo, Saque, Colocación o Físico.
 *    No da mejora gratis: la reparte. trainProg pasa al plan un N.PLAN_SHIFT del progreso semanal de los otros grupos (la suma no
 *    cambia), trainPick manda la mejora del grupo al atributo del plan (si no pasa en más de N.PLAN_SPREAD al más bajo del grupo) y
 *    sessMul hace rendir ×N.PLAN_SESS las sesiones de sus ejercicios. Al acabar, un mensaje con lo ganado.
 * Sin elegir nada, la Carrera es la misma (tools/devtest.js §1): solo llegan las propuestas (mensajes y c.dev).
 * Estado en c.dev (ensure idempotente y sin tiradas; sin subir VER/VER6). Azar: K(c)._rng(K(c)._hash(c.seed, 'dev', …)). Sin DOM al
 * cargar (se carga en node con vm). No toca sim.js, ni la titularidad, ni la química, ni las consignas (siguen tu puesto solas).
 */
(function (root) {
  'use strict';
  var VB = root.VB = root.VB || {};

  // ------------------------------------------------------------------ constantes
  var N = {
    POS_MIN: 2, POS_P: 0.45, W_FIT: 0.35, FIT_TOL: 6, W_DEPTH: 2, BENCH_W: 0.5, BENCH_MAX: 4, SUB_B: 2, OUT_B: 3, START_B: 2, POS_MAX_S: 2, POS_EXP: 3, POS_WEEK: 2,
    COOL_NEW: 3, COOL_POS: 6, COOL_ACC: 8, COOL_REJ: 10, COOL_EXP: 6, COOL_JOIN: 3,
    ACC_COACH: 3, REJ_COACH: 4, REJ_COACH_HI: 2, REJ_HI: 70, REJ2_COACH: 6, ASK_NO_COACH: 2, ASK_COACH: 40, ASK_WAIT: 8,
    ADAPT: 4, ADAPT_OFF: 2, ADAPT_D: 2,
    PLAN_LEN: 6, PLAN_SHIFT: 0.4, PLAN_SPREAD: 20, PLAN_SESS: 1.2,
    HIST_MAX: 8
  };
  var KEYS = ['jump', 'speed', 'react', 'recv', 'dig', 'set', 'spike', 'ctl', 'block', 'serve'];
  var ATTR = { jump: 'Salto', speed: 'Velocidad', react: 'Reacción', recv: 'Recepción', dig: 'Defensa', set: 'Colocación', spike: 'Potencia', ctl: 'Control', block: 'Bloqueo', serve: 'Saque' };
  var TGROUP0 = { phys: ['jump', 'speed', 'react'], def: ['recv', 'dig', 'block'], atk: ['set', 'spike', 'ctl', 'serve'] };
  /** Planes: atributos (k) y ejercicios de las sesiones (d, ids de SESS_DRILL). */
  var PLANS = {
    atk: { name: 'Ataque', k: ['spike', 'ctl'], d: ['atk'] },
    rcv: { name: 'Recepción', k: ['recv', 'dig'], d: ['recv'] },
    blk: { name: 'Bloqueo', k: ['block', 'jump'], d: ['block'] },
    srv: { name: 'Saque', k: ['serve'], d: ['serve'] },
    set: { name: 'Colocación', k: ['set', 'ctl'], d: ['set'] },
    fis: { name: 'Físico', k: ['jump', 'speed', 'react'], d: [] }
  };
  var PLAN_KEYS = ['atk', 'rcv', 'blk', 'srv', 'set', 'fis'];
  /** Recomendados por puesto (el primero es el que deja el entrenador al aceptar un cambio). */
  var REC = { OH: ['rcv', 'atk'], OPP: ['atk', 'blk'], MB: ['blk', 'atk'], S: ['set', 'srv'], L: ['rcv'], atk: ['blk', 'atk'], cr: ['rcv', 'set'], uni: ['srv', 'fis'] };
  var BEACH_POS = ['atk', 'cr'], MATE_OF = { atk: 'cr', cr: 'atk', uni: 'uni' };
  // estilos del compañero por papel (los mismos textos que MATE_STYLES de career.js; al cambiar de papel se elige uno del nuevo)
  var MATE_STY = { atk: ['Rematador potente', 'Saltador', 'Muro en la red'], cr: ['Colocador fino', 'Pulpo en la arena', 'Receptor seguro'] };

  // ------------------------------------------------------------------ ayudas
  function C() { return VB.Career || null; }
  var HV = null, HVsrc = null;
  /** Motor de la carrera c: playa, o una vista «pista sobre playa» (lo común de la playa —_msg, _rng, playerOvr…— y lo de la pista). */
  function K(c) {
    var X = C(); if (!X || !X.beach) return X;
    if (!(c && c.mode === 'hall') || !X.hall) return X.beach;
    if (HVsrc !== X.hall) { HVsrc = X.hall; HV = {}; var k; for (k in X.beach) HV[k] = X.beach[k]; for (k in X.hall) HV[k] = X.hall[k]; }
    return HV;
  }
  function hall(c) { return !!(c && c.mode === 'hall'); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clampI(v, a, b) { v = Math.round(+v); return isFinite(v) ? clamp(v, a, b) : a; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function R(c, tag) { var E = K(c), d = c.dev || {}; return E._rng(E._hash(c.seed, 'dev', tag, c.season | 0, d.t | 0)); }
  function ord(n) { var X = C(); return X && X.ordn ? X.ordn(n) : n + (n === 1 || n === 3 ? 'r' : 'º'); }
  function lab(k) { var L = VB.Prog && VB.Prog.LABEL; return (L && L[k]) || ATTR[k] || k; }
  function low(s) { return String(s || '').toLowerCase(); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }
  function listY(a) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1]; }
  function tgroup() { var X = C(); return (X && X.TGROUP) || TGROUP0; }
  function msg(c, t, x) { var E = K(c); if (!E || !E._msg) return null; var m = E._msg(c, 'coach', t, x); if (m) m.dv = 1; return m; }
  function save(c) { var E = K(c); try { if (E && E.save) E.save(c); } catch (e) { } }
  function myClub(c) { var E = K(c); if (!c || !E || (c.myClub | 0) < 0 || c.myClub == null) return null; try { return E.myClub ? E.myClub(c) : E._myClub(c); } catch (e) { return null; } }
  function blockedNow(c) {
    try { var X = C(); if (X && X.ext && X.ext.blocked && X.ext.blocked(c, null)) return true; } catch (e) { }
    try { if (VB.CareerInj && typeof VB.CareerInj.out === 'function' && VB.CareerInj.out(c)) return true; } catch (e) { }
    return false;
  }

  // ------------------------------------------------------------------ puestos y encaje
  /** Puestos que se pueden llevar (destinos posibles): pista = K(c).positions() (crece solo si sim añade el líbero); playa = atk y cr. */
  function posList(c) {
    if (!hall(c)) return BEACH_POS.slice();
    var E = K(c), l = []; try { l = E.positions ? E.positions() : ['OH']; } catch (e) { l = ['OH']; }
    return l.filter(function (p) { return !!prof(c, p); });
  }
  function prof(c, p) {
    var X = C(); if (!X) return null;
    var T = hall(c) ? X.POS6 || (X.hall && X.hall.POS) : X.beach && X.beach.ROLES;
    return T && T[p] && T[p].off ? T[p] : null;
  }
  function posName(c, p) { var P = prof(c, p); return P ? P.name : String(p || ''); }
  function curPos(c) { return c && c.player ? c.player.roleKey : ''; }
  function meanSt(st) { var s = 0; KEYS.forEach(function (k) { s += num(st[k], 50); }); return s / KEYS.length; }
  /** Encaje de unos atributos con un perfil (en puntos; un receptor recién creado da ≈ +12 de receptor). */
  function fitSt(st, off) {
    if (!st || !off) return 0;
    var m = meanSt(st), s = 0, n = 0;
    KEYS.forEach(function (k) { var o = +off[k] || 0; s += o * (num(st[k], 50) - m); n += o * o; });
    return n ? s / Math.sqrt(n) : 0;
  }
  function fitN(c, p) { var P = prof(c, p); return P && c.player ? fitSt(c.player.st, P.off) : 0; }
  function pct(f) { return clampI(50 + 50 * Math.tanh(f / 15), 0, 100); }   // (un perfil puro ≈ 84 %; sin tope duro arriba ni abajo)
  /** Encaje 0-100 de tu jugador con el puesto p (lo puede usar la selección para convocar por puesto). */
  function fit(c, p) { return pct(fitN(c, p)); }
  /** Encaje con cada puesto que se puede llevar: [{p, name, fit, cur}]. */
  function fits(c) { return posList(c).map(function (p) { return { p: p, name: posName(c, p), fit: fit(c, p), cur: p === curPos(c) }; }); }
  /** Los 2 atributos clave de un puesto (los de perfil más alto). */
  function keyAttrs(c, p) { var P = prof(c, p); if (!P) return []; return KEYS.slice().sort(function (a, b) { return (P.off[b] || 0) - (P.off[a] || 0) || KEYS.indexOf(a) - KEYS.indexOf(b); }).slice(0, 2); }
  /** Atributos tuyos que más pegan con el puesto p (aportan al encaje, de mayor a menor), hasta n. */
  function strongFor(c, p, n) {
    var P = prof(c, p); if (!P || !c.player) return [];
    var st = c.player.st, m = meanSt(st);
    return KEYS.filter(function (k) { return (P.off[k] || 0) > 0 && num(st[k], 50) - m > 0; })
      .sort(function (a, b) { return P.off[b] * (st[b] - m) - P.off[a] * (st[a] - m); }).slice(0, n || 2);
  }
  /** Pista: tu sitio en la plantilla del puesto p. {rk, n, gap, slots}: rk-ésimo de n contando tu media + meEdge; gap = tu ventaja (o
   *  lo que te falta, negativo) sobre el último titular del puesto; depth = puestos por detrás del seis (0 = titular). El puesto actual con c.sq6 (la de verdad); los demás, la plantilla
   *  que tendrías (la misma que crearía _setPos: squad6 con ese puesto, determinista). */
  function rankIn(c, p) {
    var E = K(c), k = myClub(c); if (!k || !E || !E.squad) return null;
    var season = (c.season | 0) + (c.phase === 'off' ? 1 : 0), list = null;
    var played = E.ctrlRole ? E.ctrlRole(c) : curPos(c);
    if (p === played && c.sq6 && c.sq6.club === k.id && c.sq6.pos === p && Array.isArray(c.sq6.list)) list = c.sq6.list;
    else { try { list = E.squad(c, k, season, p); } catch (e) { list = null; } }
    if (!Array.isArray(list)) return null;
    var mates = list.filter(function (x) { return x && x.pos === p; }).map(function (x) { return x.ovr | 0; }).sort(function (a, b) { return b - a; });
    var yo = (E.playerOvr ? E.playerOvr(c) : 50) + (E.meEdge ? E.meEdge(c) : 0), slots = (E.SLOTS && E.SLOTS[p]) || 1;
    var tgt = mates.length ? mates[Math.min(slots, mates.length) - 1] : null;
    var rk = 1 + mates.filter(function (o) { return o >= yo; }).length;
    return { rk: rk, n: mates.length + 1, gap: tgt == null ? 9 : yo - tgt, slots: slots, depth: Math.max(0, rk - slots) };
  }
  /** Playa: encaje de tu pareja con un papel. */
  function mateFit(c, r) { var X = C(), T = X && X.beach && X.beach.ROLES; return c.mate && T && T[r] ? fitSt(c.mate.st, T[r].off) : 0; }
  /** Necesidad del equipo (−6..6). Pista: tu sitio en la plantilla del puesto nuevo contra el de ahora: la distancia con el último
   *  titular (gap) y los puestos que te quedan por delante hasta el seis (depth, × N.W_DEPTH). squad6 pone en cada puesto titulares
   *  de la media del club, así que de joven el gap es negativo en todos: lo que cambia es cuántos tienes delante (de 4º de 4
   *  receptores a 2º de 2 opuestos: 1r suplente en vez de 2º). Playa: lo que gana o pierde tu pareja al pasar al otro papel (mitad
   *  de su cambio de encaje). */
  function needOf(c, p) {
    var cur = curPos(c);
    if (hall(c)) {
      var a = rankIn(c, p), b = rankIn(c, cur); if (!a || !b) return { v: 0 };
      return { v: clamp(Math.round(((a.gap - b.gap) + N.W_DEPTH * (b.depth - a.depth)) * 10) / 10, -6, 6), to: a, from: b };
    }
    if (!c.mate) return { v: 0 };
    var mr = c.mate.roleKey || MATE_OF[cur] || 'uni', nr = MATE_OF[p] || 'uni';
    return { v: clamp((mateFit(c, nr) - mateFit(c, mr)) / 2, -6, 6), mr: mr, nr: nr };
  }
  /** Puntuación del cambio a p (≥ N.POS_MIN: el entrenador lo propone).
   *  - Pista: N.W_FIT × (cambio de encaje, sin contar una pérdida de hasta N.FIT_TOL) + necesidad + (suplente +2, fuera +3, +N.BENCH_W
   *    por jornada seguida en el banquillo). Pesa más jugar que encajar: un receptor suplente puede acabar de opuesto aunque encaje
   *    algo peor (la tarjeta lo dice: «Tu encaje baja: 64 % › 54 %»), pero solo si allí el titular está más a mano (use).
   *  - Playa: lo que gana la pareja con los papeles cambiados, (tu cambio de encaje + el de tu pareja) / 2. Los perfiles de playa
   *    suman 0, así que el encaje se compara entre jugadores: el que salta y bloquea más que su pareja va a la red. Con los atributos
   *    de salida (los del papel) nunca pasa; pasa si cultivas los del otro papel con tus puntos. */
  function scoreOf(c, p) {
    var nd = needOf(c, p), df = fitN(c, p) - fitN(c, curPos(c)), s, use = true;
    if (hall(c)) {
      s = N.W_FIT * (df >= 0 ? df : Math.min(0, df + N.FIT_TOL)) + nd.v;   // (perder hasta N.FIT_TOL de encaje no cuenta: polivalencia)
      if (c.sq6) s += c.sq6.stat === 'out' ? N.OUT_B : c.sq6.stat === 'sub' ? N.SUB_B : 0;
      s += N.BENCH_W * Math.min(N.BENCH_MAX, (c.dev && c.dev.pos && c.dev.pos.bn) | 0);   // (jornadas seguidas sin salir de inicio)
      if (nd.to && nd.from && nd.to.depth === 0 && nd.from.depth > 0) s += N.START_B;   // (allí serías titular y aquí no)
      use = df >= 0 || nd.v >= 1;   // (si encajas peor, solo si allí tienes el sitio más a mano: nunca un cambio que no te acerca al seis)
    } else s = c.mate ? (df + 2 * nd.v) / 2 : df;
    return { p: p, s: Math.round(s * 10) / 10, need: nd, dfit: df, use: use };
  }
  /** Mejor destino (o null): el de más puntuación entre los puestos que no son el tuyo y que tienen sentido (use). */
  function bestMove(c) {
    var cur = curPos(c), best = null;
    posList(c).forEach(function (p) { if (p === cur) return; var s = scoreOf(c, p); if (s.use && (!best || s.s > best.s)) best = s; });
    return best;
  }

  // ------------------------------------------------------------------ estado (c.dev)
  function newDev(c) {
    return { v: 1, t: 0, pos: { off: null, cool: N.COOL_NEW, nS: 0, rejS: 0, askT: -99, sumS: 0, bn: 0, adapt: null, hist: [] }, plan: null };
  }
  function strArr(a, n, len) { return (Array.isArray(a) ? a : []).filter(function (x) { return typeof x === 'string'; }).slice(0, n).map(function (x) { return x.slice(0, len); }); }
  /** Crea o repara c.dev campo a campo (idempotente, sin tiradas). */
  function ensure(c) {
    if (!c || typeof c !== 'object') return null;
    var d = c.dev;
    if (!d || typeof d !== 'object' || Array.isArray(d)) { d = c.dev = newDev(c); return d; }
    d.v = 1; d.t = clampI(num(d.t, 0), 0, 1e6);
    var P = d.pos;
    if (!P || typeof P !== 'object' || Array.isArray(P)) P = d.pos = newDev(c).pos;
    P.cool = clampI(num(P.cool, d.t + N.COOL_NEW), 0, 1e6);
    P.nS = clampI(num(P.nS, 0), 0, 9); P.rejS = clampI(num(P.rejS, 0), 0, 9);
    P.askT = clampI(num(P.askT, -99), -99, 1e6); P.sumS = clampI(num(P.sumS, 0), 0, 1e4); P.bn = clampI(num(P.bn, 0), 0, 99);
    var valid = posList(c);
    var o = P.off;
    if (o && typeof o === 'object' && valid.indexOf(o.to) >= 0 && o.to !== curPos(c)) {
      o.from = typeof o.from === 'string' ? o.from : curPos(c);
      o.why = strArr(o.why, 3, 140); o.t = clampI(num(o.t, d.t), 0, 1e6); o.exp = clampI(num(o.exp, o.t + N.POS_EXP), 0, 1e6);
      o.text = typeof o.text === 'string' ? o.text.slice(0, 600) : '';
      if (o.mate != null && typeof o.mate !== 'string') o.mate = null;
    } else P.off = null;
    var a = P.adapt;
    if (a && typeof a === 'object' && typeof a.pos === 'string') {
      a.k = strArr(a.k, 2, 8).filter(function (k) { return KEYS.indexOf(k) >= 0; });
      a.left = clampI(num(a.left, 0), 0, N.ADAPT); a.d = clampI(num(a.d, N.ADAPT_D), 1, 4);
      if (!a.left || !a.k.length) P.adapt = null;
    } else P.adapt = null;
    P.hist = (Array.isArray(P.hist) ? P.hist : []).filter(function (h) { return h && typeof h === 'object' && typeof h.how === 'string'; }).slice(-N.HIST_MAX);
    var pl = d.plan;
    if (pl && typeof pl === 'object' && PLANS[pl.k]) {
      pl.len = clampI(num(pl.len, N.PLAN_LEN), 1, 20); pl.left = clampI(num(pl.left, pl.len), 0, pl.len);
      pl.s = clampI(num(pl.s, c.season | 0), 0, 1e4); pl.t0 = clampI(num(pl.t0, d.t), 0, 1e6); pl.auto = pl.auto ? 1 : 0;
      var st0 = pl.st0 && typeof pl.st0 === 'object' ? pl.st0 : {}, cl = {};
      PLANS[pl.k].k.forEach(function (k) { cl[k] = clampI(num(st0[k], c.player && c.player.st ? c.player.st[k] : 50), 1, 99); });
      pl.st0 = cl;
      if (!pl.left) d.plan = null;
    } else d.plan = null;
    return d;
  }
  function hist(c, how, from, to) {
    var d = ensure(c); d.pos.hist.push({ s: c.season | 0, t: d.t, from: from, to: to, how: how });
    if (d.pos.hist.length > N.HIST_MAX) d.pos.hist = d.pos.hist.slice(-N.HIST_MAX);
  }
  function coachAdd(c, v) { c.coach = clamp((c.coach | 0) + v, 0, 100); }

  // ------------------------------------------------------------------ propuesta del entrenador
  /** ¿Puede el entrenador proponerte un cambio en esta jornada? '' si sí. */
  function canPropose(c) {
    var d = ensure(c), P = d.pos;
    if (c.phase !== 'league') return 'phase';
    if (!myClub(c)) return 'club';
    if ((c.week | 0) < N.POS_WEEK) return 'week';
    if (hall(c) ? posList(c).length < 2 : !c.mate) return 'pos';
    if (P.off) return 'off';
    if (P.adapt) return 'adapt';
    if (d.t < P.cool) return 'cool';
    if (P.nS >= N.POS_MAX_S) return 'max';
    if (P.rejS >= 2) return 'rej';
    if (blockedNow(c)) return 'baja';
    return '';
  }
  /** Pista: tu sitio en el puesto según rankIn: «titular» o «el 1r suplente». */
  function gapTxt(q) { return q.gap >= 0 ? 'superas al titular' : 'el titular te saca ' + (-q.gap); }
  function place(q) { return !q || q.depth <= 0 ? 'titular' : 'el ' + ord(q.depth) + ' suplente'; }
  /** Razones (2-3 líneas cortas) y texto del mensaje de una propuesta a p. */
  function offerOf(c, mv) {
    var p = mv.p, cur = curPos(c), to = low(posName(c, p)), from = low(posName(c, cur)), st = c.player.st;
    var sg = strongFor(c, p, 2), why = [], nd = mv.need || {}, vs = hall(c) ? null : betterThanMate(c, p);
    if (vs) why.push(vs);
    else if (sg.length) why.push((sg.length > 1 ? 'Tu ' + low(lab(sg[0])) + ' (' + st[sg[0]] + ') y tu ' + low(lab(sg[1])) + ' (' + st[sg[1]] + ') pegan' : 'Tu ' + low(lab(sg[0])) + ' (' + st[sg[0]] + ') pega') + ' con el puesto');
    var o = { to: p, from: cur, why: why, t: ensure(c).t, exp: ensure(c).t + N.POS_EXP, text: '', mate: null };
    var x = '';
    if (hall(c)) {
      var A = nd.to, B = nd.from, stat = c.sq6 && c.sq6.stat, minutes = '';
      if (A && B && nd.v >= 1) {
        if (A.depth === 0 && B.depth > 0) minutes = 'De ' + to + ' serías titular' + (stat === 'start' ? '' : '; ahora, ' + place(B));
        else if (A.gap > B.gap && B.gap < 0) minutes = 'De ' + to + ', ' + gapTxt(A) + '; de ' + from + ', ' + gapTxt(B);
      }
      if (minutes) why.push(minutes);
      if (stat === 'sub' || stat === 'out') why.push(stat === 'out' ? 'Ahora no entras en la convocatoria' : 'Ahora no juegas de inicio');
      x = (mv.dfit >= 0 ? 'Te veo más de ' + to + ' que de ' + from + '. ' + (sg.length ? why[0] + '. ' : '') : nd.v >= 1 ? 'Me hace falta alguien de ' + to + ' y creo que puedes serlo. ' : 'Quiero probarte de ' + to + '. ') +
        (minutes ? minutes + '. ' : '');
    } else {
      var mn = c.mate ? c.mate.name : 'tu pareja', mfirst = String(mn).split(' ')[0];
      o.mate = mn;
      if (nd.v >= 1) why.push(mfirst + ' rinde más ' + (p === 'cr' ? 'en la red' : 'atrás'));
      x = '¿Y si cambiáis los papeles? ' + (p === 'cr' ? 'Tú atrás, de defensor, y ' + mfirst + ' en la red.' : 'Tú en la red, de bloqueador, y ' + mfirst + ' atrás.') + ' ' + (sg.length ? why[0] + '. ' : '') +
        (nd.v >= 1 ? mfirst + ' también saldría ganando. ' : '');
      if (vs) x = x.replace(why[0] + '. ', vs + '. ');
    }
    if (!why.length) why.push('Te ve mejor de ' + to);
    if (mv.dfit <= -1.5) why.push('Tu encaje baja: ' + fit(c, cur) + ' % › ' + fit(c, p) + ' %');
    o.why = why.length > 3 ? why.slice(0, 2).concat(why.slice(-1)) : why;
    o.text = x + '¿Lo probamos? Dímelo antes de ' + plural(N.POS_EXP, 'jornada', 'jornadas') + ': lo tienes en Partido.';
    return o;
  }
  var VERB = { recv: 'Recibes', dig: 'Defiendes', set: 'Colocas', spike: 'Rematas', jump: 'Saltas', block: 'Bloqueas', serve: 'Sacas', ctl: 'Controlas', speed: 'Corres', react: 'Reaccionas' };
  /** Playa: «Recibes mejor que Pau (44 contra 38)», el atributo del papel nuevo en el que más le sacas a tu pareja (o ''). */
  function betterThanMate(c, p) {
    var P = prof(c, p); if (!P || !c.mate || !c.mate.st) return '';
    var st = c.player.st, ms = c.mate.st, best = '', bv = 0;
    KEYS.forEach(function (k) { var o = P.off[k] || 0, v = o * ((st[k] | 0) - (ms[k] | 0)); if (o > 0 && v > bv) { bv = v; best = k; } });
    return best ? VERB[best] + ' mejor que ' + String(c.mate.name).split(' ')[0] + ' (' + (st[best] | 0) + ' contra ' + (ms[best] | 0) + ')' : '';
  }
  function propose(c, mv) {
    var d = ensure(c), o = offerOf(c, mv);
    d.pos.off = o; d.pos.nS++; d.pos.cool = d.t + N.COOL_POS;
    msg(c, 'El entrenador quiere hablar de tu puesto', o.text);
    return o;
  }
  /** Tirada de la jornada (life 'match'). */
  function maybePropose(c) {
    if (canPropose(c)) return null;
    var mv = bestMove(c); if (!mv || mv.s < N.POS_MIN) return null;
    if (R(c, 'pos')() >= N.POS_P) return null;
    return propose(c, mv);
  }

  // ------------------------------------------------------------------ aplicar un cambio
  function adaptTxt(c, a) { return a ? '−' + a.d + ' en ' + listY(a.k.map(function (k) { return low(lab(k)); })) : ''; }
  /** Cambia tu puesto a p sin guardar: pista con _setPos (plantilla del puesto nuevo); playa con tu pareja al otro papel. */
  function applyPos(c, p) {
    if (hall(c)) { var E = K(c); return !!(E._setPos && E._setPos(c, p, true)); }
    var X = C(), T = X && X.beach && X.beach.ROLES; if (!T || !T[p] || BEACH_POS.indexOf(p) < 0) return false;
    c.player.roleKey = p; c.player.role = T[p].name;
    if (c.mate) {
      var mr = MATE_OF[p];
      if (c.mate.roleKey !== mr) {
        c.mate.roleKey = mr; c.mate.role = T[mr].name;
        var l = MATE_STY[mr]; if (l) c.mate.style = l[K(c)._hash(c.seed, 'dev-msty', c.mate.name, mr) % l.length];
      }
    }
    return true;
  }
  /** Cambio hecho (aceptar, pedir con éxito, verano): adaptación, plan automático y frío. Devuelve el texto de lo que cuesta. */
  function afterMove(c, p, short) {
    var d = ensure(c), ks = keyAttrs(c, p);
    d.pos.adapt = { pos: p, k: ks, left: short ? N.ADAPT_OFF : N.ADAPT, d: N.ADAPT_D };
    d.pos.off = null; d.pos.bn = 0; d.pos.cool = d.t + N.COOL_ACC;
    var planTxt = '';
    if (!d.plan && REC[p]) { startPlan(c, REC[p][0], 1); planTxt = ' Te dejo un plan de ' + low(PLANS[REC[p][0]].name) + ' de ' + N.PLAN_LEN + ' jornadas; lo cambias en Jugador › Estado.'; }
    var n = d.pos.adapt.left;
    return (n === 1 ? 'La 1ª jornada te costará: ' : 'Las ' + n + ' primeras jornadas te costarán: ') + adaptTxt(c, d.pos.adapt) + '.' + planTxt;
  }
  function mateLine(c, p) { return !hall(c) && c.mate ? ' y ' + String(c.mate.name).split(' ')[0] + ' pasa a ' + low(posName(c, MATE_OF[p])) : ''; }
  /** Aceptar la propuesta pendiente (sin guardar). true si ha cambiado. */
  function accept(c) {
    var d = ensure(c), o = d.pos.off; if (!o) return false;
    var from = curPos(c);
    if (!applyPos(c, o.to)) { d.pos.off = null; return false; }
    coachAdd(c, N.ACC_COACH);
    var cost = afterMove(c, o.to, false);
    hist(c, 'acepta', from, o.to);
    msg(c, 'Nuevo puesto: ' + low(posName(c, o.to)), 'Trato hecho: desde la próxima jornada juegas de ' + low(posName(c, o.to)) + mateLine(c, o.to) + '. ' + cost);
    return true;
  }
  /** Rechazar la propuesta pendiente (sin guardar). */
  function reject(c) {
    var d = ensure(c), o = d.pos.off; if (!o) return false;
    d.pos.off = null; d.pos.rejS++; d.pos.cool = d.t + N.COOL_REJ;
    var second = d.pos.rejS >= 2;
    coachAdd(c, -(second ? N.REJ2_COACH : (c.coach | 0) >= N.REJ_HI ? N.REJ_COACH_HI : N.REJ_COACH));
    if (second) d.pos.rejS = 2;
    hist(c, 'rechaza', curPos(c), o.to);
    msg(c, second ? 'No insistiré más' : 'Sigues de ' + low(posName(c, curPos(c))),
      second ? 'Es la segunda vez que me dices que no. No te lo vuelvo a pedir esta temporada.' : 'Vale, sigues de ' + low(posName(c, curPos(c))) + '. Pues gánate el sitio ahí.');
    return true;
  }
  function expire(c) {
    var d = ensure(c), o = d.pos.off; if (!o) return;
    d.pos.off = null; d.pos.cool = d.t + N.COOL_EXP;
    hist(c, 'caduca', curPos(c), o.to);
    msg(c, 'Lo dejamos como está', 'No me has dicho nada del cambio a ' + low(posName(c, o.to)) + '. Lo dejamos como está.');
  }

  // ------------------------------------------------------------------ pedirlo tú
  /** ¿Puedes pedir un cambio ahora? '' si sí; si no 'pick' | 'pos' | 'off' (propuesta pendiente) | 'adapt' | 'wait' | 'summer'. */
  function askOk(c) {
    var d = ensure(c);
    if (!c || c.phase === 'pick' || !myClub(c)) return 'pick';
    if (posList(c).filter(function (p) { return p !== curPos(c); }).length < 1) return 'pos';
    if (d.pos.off) return 'off';
    if (d.pos.adapt) return 'adapt';
    if (c.phase === 'off') return d.pos.sumS === (c.season | 0) ? 'summer' : '';
    if (d.t - d.pos.askT < N.ASK_WAIT) return 'wait';
    return '';
  }
  function askWait(c) { var d = ensure(c); return Math.max(0, N.ASK_WAIT - (d.t - d.pos.askT)); }
  function roleIdx(c) { var E = K(c); try { return E.roleIdx ? E.roleIdx(c) : 1; } catch (e) { return 1; } }
  /** Probabilidad de que el entrenador diga que sí a pasarte a p: {ch (0-1), lab, auto: 'yes'|'no'|''}. */
  function askChance(c, p) {
    if (c.phase === 'off') return { ch: 1, lab: 'Sí, en pretemporada', auto: 'yes' };
    if (roleIdx(c) === 0 && (c.coach | 0) < N.ASK_COACH) return { ch: 0, lab: 'Sin opciones', auto: 'no' };
    var ch = clamp(0.25 + ((c.coach | 0) - 50) / 100 + 0.06 * (fitN(c, p) - fitN(c, curPos(c))) + 0.04 * needOf(c, p).v, 0.05, 0.9);
    ch = Math.round(ch * 100) / 100;
    return { ch: ch, lab: ch >= 0.6 ? 'Probable' : ch >= 0.3 ? 'Difícil' : 'Muy difícil', auto: '' };
  }
  /** Pedir el cambio a p (sin guardar). {ok, yes, why?, text}. */
  function ask(c, p) {
    var d = ensure(c), w = askOk(c);
    if (w) return { ok: false, why: w };
    if (posList(c).indexOf(p) < 0 || p === curPos(c)) return { ok: false, why: 'pos' };
    var A = askChance(c, p), from = curPos(c), to = low(posName(c, p)), t;
    if (A.auto === 'yes') {
      if (!applyPos(c, p)) return { ok: false, why: 'pos' };
      d.pos.sumS = c.season | 0; d.pos.askT = d.t;
      t = 'En pretemporada hay tiempo para probar: empiezas la temporada de ' + to + mateLine(c, p) + '. ' + afterMove(c, p, true);
      hist(c, 'verano', from, p); msg(c, 'Nuevo puesto: ' + to, t);
      return { ok: true, yes: true, text: t };
    }
    d.pos.askT = d.t;
    if (A.auto === 'no') {
      t = 'Antes de pedirme cambios, gánate mi confianza.';
      hist(c, 'pide-no', from, p); msg(c, 'Ahora no', t);
      return { ok: true, yes: false, text: t };
    }
    var yes = R(c, 'ask-' + p)() < A.ch;
    if (yes) {
      if (!applyPos(c, p)) return { ok: false, why: 'pos' };
      t = 'Me convence: pasas a ' + to + mateLine(c, p) + '. ' + afterMove(c, p, false);
      hist(c, 'pide-si', from, p); msg(c, 'Nuevo puesto: ' + to, t);
      return { ok: true, yes: true, text: t };
    }
    coachAdd(c, -N.ASK_NO_COACH);
    var ks = keyAttrs(c, p), wk = ks.slice().sort(function (a, b) { return c.player.st[a] - c.player.st[b]; })[0];
    t = 'De ' + to + ' no te veo: te falta ' + low(lab(wk)) + ' (' + c.player.st[wk] + '). Trabájalo y vuelve a pedírmelo.';
    hist(c, 'pide-no', from, p); msg(c, 'Sigues de ' + low(posName(c, from)), t);
    return { ok: true, yes: false, text: t };
  }

  // ------------------------------------------------------------------ plan de desarrollo
  function startPlan(c, k, auto) {
    var d = ensure(c), st0 = {};
    PLANS[k].k.forEach(function (a) { st0[a] = c.player.st[a] | 0; });
    d.plan = { k: k, left: N.PLAN_LEN, len: N.PLAN_LEN, s: c.season | 0, t0: d.t, st0: st0, auto: auto ? 1 : 0 };
    return d.plan;
  }
  /** Empieza el plan k (sin guardar). Sin coste. false si no existe o ya es el tuyo y va empezado de cero. */
  function setPlan(c, k) {
    if (!PLANS[k] || !c || !c.player) return false;
    var d = ensure(c); if (d.plan && d.plan.k === k && d.plan.left === d.plan.len) return false;
    startPlan(c, k, 0); return true;
  }
  function stopPlan(c) { var d = ensure(c); if (!d.plan) return false; d.plan = null; return true; }
  /** Datos del plan para pintar: {k, name, left, len, done, attrs:[{k, name, v0, v}]} o null. */
  function planInfo(c) {
    var d = ensure(c), p = d && d.plan; if (!p) return null;
    return { k: p.k, name: PLANS[p.k].name, left: p.left, len: p.len, done: p.len - p.left, auto: !!p.auto,
      attrs: PLANS[p.k].k.map(function (a) { return { k: a, name: lab(a), v0: p.st0[a], v: c.player.st[a] | 0 }; }) };
  }
  function planEnd(c) {
    var d = c.dev, p = d && d.plan; if (!p || !PLANS[p.k]) return null;   // (sin ensure: con left 0 lo quitaría antes de avisar)
    var parts = PLANS[p.k].k.map(function (a) { return low(lab(a)) + ' ' + p.st0[a] + ' › ' + (c.player.st[a] | 0); });
    var t = 'Plan de ' + low(PLANS[p.k].name) + ' cumplido: ' + listY(parts) + ' en ' + plural(p.len, 'jornada', 'jornadas') + '.';
    msg(c, 'Plan de ' + low(PLANS[p.k].name) + ' cumplido', t + ' Elige otro en Jugador › Estado si quieres seguir.');
    d.plan = null;
    return t;
  }
  function planGroups(c, k) { var G = tgroup(), out = []; Object.keys(G).forEach(function (g) { if (PLANS[k].k.some(function (a) { return G[g].indexOf(a) >= 0; })) out.push(g); }); return out; }
  /** Gancho del entreno semanal: pasa N.PLAN_SHIFT del progreso de los grupos fuera del plan a los del plan (la suma no cambia). */
  function trainProg(c, prog) {
    var d = c && c.dev, p = d && d.plan; if (!p || !PLANS[p.k] || !prog) return;
    var gp = planGroups(c, p.k); if (!gp.length) return;
    var pool = 0;
    Object.keys(prog).forEach(function (g) { if (gp.indexOf(g) >= 0) return; var v = +prog[g] || 0, tk = Math.round(N.PLAN_SHIFT * v); if (tk > 0) { prog[g] = v - tk; pool += tk; } });
    if (!pool) return;
    var each = Math.floor(pool / gp.length), rest = pool - each * gp.length;
    gp.forEach(function (g, i) { prog[g] = (+prog[g] || 0) + each + (i < rest ? 1 : 0); });
  }
  /** Gancho del orden de mejora del grupo g: primero el atributo del plan (el más bajo de los suyos) si no pasa en más de
   *  N.PLAN_SPREAD al más bajo del grupo. null = sin cambios. */
  function trainPick(c, g, ks) {
    var d = c && c.dev, p = d && d.plan; if (!p || !PLANS[p.k] || !Array.isArray(ks) || !ks.length) return null;
    var st = c.player.st, lo = st[ks[0]];
    var cand = ks.filter(function (k) { return PLANS[p.k].k.indexOf(k) >= 0 && st[k] - lo <= N.PLAN_SPREAD; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return st[a] - st[b] || ks.indexOf(a) - ks.indexOf(b); });
    var first = cand[0]; if (first === ks[0]) return null;
    return [first].concat(ks.filter(function (k) { return k !== first; }));
  }
  /** Gancho de las sesiones: ×N.PLAN_SESS en los ejercicios del plan. */
  function sessMul(c, id) { var d = c && c.dev, p = d && d.plan; return p && PLANS[p.k] && PLANS[p.k].d.indexOf(id) >= 0 ? N.PLAN_SESS : null; }

  // ------------------------------------------------------------------ ganchos de la Carrera (VB.CareerExt)
  /** Tu atleta en las opciones del partido (pista: tu hueco o el banquillo; playa: el primero). */
  function meSt(c, m) {
    if (!m) return null;
    if (m.format === '6v6') {
      if (m.meOn === false && m.bench && m.bench[0] && m.bench[0][m.meBench | 0]) return m.bench[0][m.meBench | 0].st || null;
      return m.attrs && m.attrs[0] && m.attrs[0][m.ctrlIdx | 0] || null;
    }
    return m.attrs && m.attrs[0] && m.attrs[0][0] || null;
  }
  function onSetup(c, m) {
    var d = ensure(c), a = d.pos.adapt; if (!a || !a.left || a.pos !== curPos(c)) return;
    var st = meSt(c, m); if (!st) return;
    a.k.forEach(function (k) { if (typeof st[k] === 'number') st[k] = clamp(Math.round(st[k] - a.d), 1, 99); });
    m.dvAdapt = { k: a.k.slice(), d: a.d, left: a.left };
  }
  function onMatch(c, sum) {
    var d = ensure(c), P = d.pos, end = null;
    d.t++;
    if (hall(c) && c.phase === 'league') P.bn = c.sq6 && (c.sq6.stat === 'sub' || c.sq6.stat === 'out') ? P.bn + 1 : 0;
    if (P.adapt) { P.adapt.left--; if (P.adapt.left <= 0) P.adapt = null; }
    if (d.plan) { d.plan.left--; if (d.plan.left <= 0) end = planEnd(c); }
    if (P.off && d.t >= P.off.exp) expire(c);
    else if (!(sum && sum.out)) maybePropose(c);
    if (sum && typeof sum === 'object') sum.dev = { off: !!P.off, plan: d.plan ? d.plan.k : null, end: end };
  }
  function hook(c, kind, a, b) {
    if (!c || typeof c !== 'object' || !c.player) return;
    if (kind === 'create') { ensure(c); return; }
    var d = ensure(c); if (!d) return;
    if (kind === 'setup') onSetup(c, a);
    else if (kind === 'match') onMatch(c, a, b);
    else if (kind === 'join') { d.pos.off = null; d.pos.bn = 0; d.pos.cool = d.t + N.COOL_JOIN; }
    else if (kind === 'season') d.pos.off = null;
    else if (kind === 'newSeason') { d.pos.nS = 0; d.pos.rejS = 0; d.pos.bn = 0; d.pos.off = null; }
  }

  // ------------------------------------------------------------------ interfaz (VB.CareerUIExt)
  var uiOpen = '', flash = null;   // (lista desplegada: '' | 'plan' | 'ask'; y la respuesta de la última acción: {where, txt, go})
  var demoShow = '';   // (pantalla de muestra: la tarjeta de la lista desplegada, a la vista tras el próximo pintado; ver demo)
  // móvil (movil-aire §5.3): tocar una fila de la lista la ELIGE (marco dorado + ✓) y la barra de abajo confirma («Confirmar plan» /
  // «Pedir Opuesto»); en PC el toque sigue aplicando al momento. pick = { where: 'plan' | 'ask', k }.
  var pick = null;
  function phNow() { try { var de = document.documentElement; return !!(de && de.classList.contains('ph')); } catch (e) { return false; } }
  function abbr(s) { s = String(s || ''); return s.length > 5 ? s.slice(0, 3) : s; }
  function esc(H, s) { return H && H.esc ? H.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function spH(H, a, k) { return H && H.sp ? H.sp(a, k) : a.join(' | '); }
  function isPh(H) { try { return !!(H && H.ph && H.ph()); } catch (e) { return false; } }
  /** Explicación: en el móvil, detrás del «?» de la tarjeta; en PC, un párrafo. */
  function expl(H, title, txt) { return isPh(H) && H.q ? H.q(title, txt) : '<p class="muted">' + esc(H, txt) + '</p>'; }
  // (los botones van ya con sus clases SPLAT: así splatify no les da la mancha grande de «Jugar partido», que es la acción principal)
  function lbl(H, label) { return '<span class="sp-l"><span class="sp-t">' + esc(H, label) + '</span></span>'; }   // (rótulo como lo deja spLabel de career-ui)
  function btn(H, act, label, tone, extra) { return '<button class="sp-btn sp-md ' + (tone || 'sp-cream') + '" data-act="' + act + '"' + (extra || '') + '>' + lbl(H, label) + '</button>'; }
  /** Rótulo del botón que pliega la lista (en el móvil, corto: cabe en la fila del título). */
  function closeLbl(H) { return isPh(H) ? '×' : 'Cerrar la lista'; }
  /** Botón que abre / pliega la lista: en el móvil, abierta, es una × de 44 (sin mancha roja). */
  function openBtn(H, act, open, label, tone) {
    if (open && isPh(H)) return '<button class="cdv-x" data-act="' + act + '" aria-expanded="true" aria-label="Cerrar la lista">×</button>';
    return btn(H, act, open ? closeLbl(H) : label, tone, ' aria-expanded="' + open + '"');
  }
  /** Móvil: la barra de abajo con la confirmación de lo elegido (phDock de career-ui recoge .acts[data-ph-dock]). */
  function dockHTML(H, act, label) { return '<div class="acts cdv-dk" data-ph-dock><button class="pri" data-act="' + act + '">' + esc(H, label) + '</button></div>'; }
  function bar(H, name, v, cur) {
    return '<div class="pbar cdv-pb' + (cur ? ' cdv-cur' : '') + '"><span>' + esc(H, name) + '</span><span class="bar"><i style="width:' + clampI(v, 0, 100) + '%"></i></span><b>' + clampI(v, 0, 100) + ' %</b></div>';
  }
  function flashHTML(H, where) {
    if (!flash || flash.where !== where) return '';
    var f = flash; flash = null;
    return '<p class="note cdv-note" role="status" aria-live="polite">' + esc(H, f.txt) + '</p>' + (f.go ? '<div class="acts">' + btn(H, 'dv-go-state', 'Ver tu plan', 'sp-kit') + '</div>' : '');
  }
  /** Partido: la propuesta pendiente (o la respuesta que acabas de dar). */
  function uiMatch(c, H) { return isPh(H) ? '' : offerCard(c, H); }
  /** Móvil: la propuesta arriba del todo de Partido (hueco matchTop), sin desplazar; en PC va debajo del partido. */
  function uiMatchTop(c, H) { return isPh(H) ? offerCard(c, H) : ''; }
  function offerCard(c, H) {
    if (!c || !c.player) return '';
    var d = ensure(c), o = d.pos.off;
    if (flash && flash.where === 'match') return '<div class="card cdv-off cdv-done"><h3>' + spH(H, ['Puesto', esc(H, posName(c, curPos(c)))], 'd') + '</h3>' + flashHTML(H, 'match') + '</div>';
    if (!o) return '';
    var left = Math.max(1, o.exp - d.t), ks = keyAttrs(c, o.to);
    var long = 'El entrenador puede proponerte otro puesto si tus atributos pegan más con él o si el equipo lo necesita. Si aceptas, sube su confianza y ' + (hall(c) ? 'juegas contra la plantilla del puesto nuevo' : 'tu pareja pasa al otro papel; la química se mantiene') + ', pero las ' + N.ADAPT + ' primeras jornadas te cuestan. Si rechazas, baja su confianza. Si no contestas, se olvida.';
    return '<div class="card cdv-off"><h3>' + spH(H, ['Propuesta', esc(H, posName(c, o.from)) + ' › ' + esc(H, posName(c, o.to))], 'd') + '</h3>' + expl(H, 'Cambio de puesto', long) +
      '<ul class="cdv-why">' + o.why.map(function (w) { return '<li>' + esc(H, w) + '</li>'; }).join('') + '</ul>' +
      '<p class="cdv-cost">' + spH(H, ['Si aceptas: confianza +' + N.ACC_COACH, plural(N.ADAPT, 'jornada', 'jornadas') + ' con −' + N.ADAPT_D + ' en ' + esc(H, listY(ks.map(function (k) { return low(lab(k)); })))].concat(hall(c) ? [] : [esc(H, String(o.mate || '').split(' ')[0] || 'tu pareja') + ' a ' + esc(H, low(posName(c, MATE_OF[o.to])))]), 'v') + '</p>' +
      '<p class="muted">' + spH(H, ['Si rechazas: confianza −' + ((c.coach | 0) >= N.REJ_HI && d.pos.rejS < 1 ? N.REJ_COACH_HI : d.pos.rejS >= 1 ? N.REJ2_COACH : N.REJ_COACH), left === 1 ? 'te queda 1 jornada para contestar' : 'te quedan ' + left + ' jornadas para contestar'], 'v') + '</p>' +
      '<div class="acts">' + btn(H, 'dv-pos-no', 'Rechazar', 'sp-cream') + btn(H, 'dv-pos-ok', 'Aceptar', 'sp-kit') + '</div></div>';
  }
  function planCard(c, H) {
    var d = ensure(c), pi = planInfo(c), rec = REC[curPos(c)] || [];
    var ph = isPh(H), pk = ph && uiOpen === 'plan' && pick && pick.where === 'plan' ? pick.k : '';
    var h = '<div class="card cdv-plan"><h3>' + spH(H, [ph ? 'Plan' : 'Plan de desarrollo', pi ? esc(H, pi.name) : 'Sin plan'], 'd') + '</h3>' +
      expl(H, 'Plan de desarrollo', 'Durante ' + N.PLAN_LEN + ' jornadas, la mejora del entreno semanal que toque al plan va a sus atributos y no al más bajo del grupo, y un ' + Math.round(N.PLAN_SHIFT * 100) + ' % del progreso de los otros grupos pasa al plan. Las sesiones de sus ejercicios rinden un ' + Math.round((N.PLAN_SESS - 1) * 100) + ' % más. No da mejora de más: la reparte. Lo dejas o lo cambias cuando quieras.');
    if (pi) {
      h += '<p>' + spH(H, ['<b>' + esc(H, pi.name) + '</b>', 'quedan ' + pi.left + ' de ' + pi.len + ' jornadas', pi.auto ? 'te lo puso el entrenador' : ''], 'v') + '</p>' +
        '<div class="pbar cdv-pb"><span>Jornadas</span><span class="bar"><i style="width:' + Math.round(100 * pi.done / pi.len) + '%"></i></span><b>' + pi.done + '/' + pi.len + '</b></div>' +
        '<p class="cdv-attrs">' + spH(H, pi.attrs.map(function (a) { return esc(H, a.name) + ' ' + a.v0 + (a.v !== a.v0 ? ' › <b>' + a.v + '</b>' : ''); }), 'c') + '</p>' +
        '<div class="acts cdv-ha">' + (ph && uiOpen === 'plan' ? '' : btn(H, 'dv-plan-stop', 'Dejar el plan', 'sp-cream')) + openBtn(H, 'dv-plan-open', uiOpen === 'plan', 'Cambiar plan', 'sp-teal') + '</div>';
    } else {
      h += (ph && uiOpen === 'plan' ? '' : '<p class="muted">Sin plan: la mejora va al atributo más bajo de cada grupo.</p>') +
        '<div class="acts cdv-ha">' + openBtn(H, 'dv-plan-open', uiOpen === 'plan', 'Elegir plan', 'sp-kit') + '</div>';
    }
    if (uiOpen === 'plan') {
      h += '<div class="cdv-list sp-rows-2" role="group" aria-label="Planes">' + PLAN_KEYS.map(function (k, i) {
        var P = PLANS[k], on = !!(d.plan && d.plan.k === k), r = rec.indexOf(k) >= 0;
        var sub = P.k.map(function (a) { return lab(a) + ' ' + (c.player.st[a] | 0); }).join(', ');
        if (ph) {   // (móvil: atributos abreviados sin elipsis, «Recomendado» como estrella, la elegida con marco dorado y ✓)
          var sb = P.k.map(function (a) { return abbr(lab(a)) + ' ' + (c.player.st[a] | 0); }).join(' · '), sel = pk === k;
          return '<button class="cdv-row cdv-phr' + (sel ? ' cdv-pick' : '') + (on ? ' cdv-on' : '') + '" data-act="dv-plan-' + k + '" aria-pressed="' + (sel || (!pk && on)) + '" aria-label="' + esc(H, P.name + ': ' + sub + (r ? '. Recomendado para tu puesto' : '') + (on ? '. Es tu plan' : '') + (sel ? '. Elegido' : '')) + '">' +
            '<span class="sp-rm"><span class="sp-t">' + (r ? '<i class="cdv-star" aria-hidden="true">★</i>' : '') + esc(H, P.name) + '</span><small class="sp-s">' + esc(H, sb) + '</small></span>' +
            '<span class="sp-rt">' + (sel ? '<i class="cdv-ck" aria-hidden="true">✓</i>' : on ? '<span class="sp-chip cdv-chip">Tu plan</span>' : '') + '</span></button>';
        }
        return '<button class="cdv-row sp-btn sp-wide sp-calm sp-lrow ' + (on ? 'sp-gold' : i % 2 ? 'sp-alt' : 'sp-ink') + '" data-shape="' + i + '" data-act="dv-plan-' + k + '" aria-pressed="' + on + '" aria-label="' + esc(H, P.name + ': ' + sub + (r ? '. Recomendado para tu puesto' : '') + (on ? '. Es tu plan' : '')) + '">' +
          '<span class="sp-rm"><span class="sp-t">' + esc(H, P.name) + '</span><small class="sp-s">' + esc(H, sub) + '</small></span>' +
          '<span class="sp-rt">' + (on ? '<span class="sp-chip cdv-chip">Tu plan</span>' : r ? '<span class="sp-chip cdv-chip">Recomendado</span>' : '') + '</span></button>';
      }).join('') + '</div>';
      if (pk) h += dockHTML(H, 'dv-plan-go', 'Confirmar plan');
    }
    return h + flashHTML(H, 'plan') + '</div>';
  }
  function posCard(c, H) {
    var d = ensure(c), cur = curPos(c), list = posList(c), w = askOk(c), others = list.filter(function (p) { return p !== cur; });
    var ph = isPh(H), askL = ph && uiOpen === 'ask' && !w, pk = askL && pick && pick.where === 'ask' ? pick.k : '';
    var h = '<div class="card cdv-pos"><h3>' + spH(H, ['Puesto', esc(H, posName(c, cur))], 'd') + '</h3>' +
      expl(H, 'Puesto', 'El encaje mide cuánto pegan tus atributos con cada puesto. El entrenador te propondrá cambiar si encajas mejor en otro o si el equipo lo necesita. También puedes pedírselo tú: en pretemporada siempre dice que sí.' + (hall(c) ? '' : ' Si cambias, tu pareja pasa al otro papel y la química se mantiene.'));
    if (askL) h += '<p class="cdv-now">Ahora: <b>' + esc(H, posName(c, cur)) + '</b> · encaje ' + fit(c, cur) + ' %</p>';   // (móvil, lista abierta: el encaje va en cada fila)
    else h += '<div class="cdv-fits">' + (list.indexOf(cur) < 0 && prof(c, cur) ? bar(H, posName(c, cur), fit(c, cur), true) : '') + list.map(function (p) { return bar(H, posName(c, p), fit(c, p), p === cur); }).join('') + '</div>';
    if (d.pos.adapt) h += '<p class="cdv-cost">' + spH(H, ['Adaptación: ' + (d.pos.adapt.left === 1 ? '1 jornada más' : d.pos.adapt.left + ' jornadas más'), esc(H, adaptTxt(c, d.pos.adapt)) + ' en los partidos que juegas'], 'v') + '</p>';
    if (!others.length) return h + '<p class="muted">Por ahora en el 6 contra 6 solo se puede llevar este puesto.</p>' + flashHTML(H, 'state') + '</div>';
    var why = w === 'wait' ? 'Podrás volver a pedirlo en ' + plural(askWait(c), 'jornada', 'jornadas') : w === 'off' ? 'Antes contesta a su propuesta, en Partido' : w === 'summer' ? 'Ya has cambiado este verano' : w === 'adapt' ? 'Primero adáptate al puesto nuevo' : w ? 'Ahora no se puede pedir' : '';
    if (why) h += '<div class="acts cdv-ha"><button class="sp-btn sp-md sp-cream sp-off" data-act="dv-ask-open" disabled aria-disabled="true">' + lbl(H, 'Pedir cambio') + '</button></div><p class="muted">' + esc(H, why) + '.</p>';
    else h += '<div class="acts cdv-ha">' + openBtn(H, 'dv-ask-open', uiOpen === 'ask', 'Pedir cambio', 'sp-teal') + '</div>';
    if (askL) {   // móvil: filas de 52 con su barrita de encaje; la dificultad, solo si no es la misma en todas; «Pedir X» en la barra de abajo
      var labs = others.map(function (p) { return askChance(c, p).lab; }), same = labs.every(function (x) { return x === labs[0]; });
      h += '<div class="cdv-list" role="group" aria-label="Pedir otro puesto">' + others.map(function (p) {
        var A = askChance(c, p), nm = posName(c, p) + (hall(c) || !c.mate ? '' : ' (y ' + String(c.mate.name).split(' ')[0] + ' ' + (p === 'cr' ? 'a la red' : 'atrás') + ')'), f = fit(c, p), sel = pk === p;
        return '<button class="cdv-row cdv-phr' + (sel ? ' cdv-pick' : '') + '" data-act="dv-ask-' + p + '" aria-pressed="' + sel + '" aria-label="' + esc(H, 'Pasar a ' + nm + '. Encaje ' + f + ' %. ' + A.lab + (sel ? '. Elegido' : '')) + '">' +
          '<span class="sp-rm"><span class="sp-t">' + esc(H, nm) + '</span><small class="sp-s cdv-fit"><i class="cdv-fb"><i style="width:' + clampI(f, 0, 100) + '%"></i></i>' + f + ' %</small></span>' +
          '<span class="sp-rt">' + (sel ? '<i class="cdv-ck" aria-hidden="true">✓</i>' : '') + (same ? '' : '<span class="sp-chip cdv-chip cdv-' + (A.ch >= 0.6 ? 'hi' : A.ch >= 0.3 ? 'md' : 'lo') + '">' + esc(H, A.lab) + '</span>') + '</span></button>';
      }).join('') + '</div>' + (same && labs.length ? '<p class="muted cdv-dif">Dificultad: ' + esc(H, labs[0].toLowerCase()) + '</p>' : '');
      if (pk) h += dockHTML(H, 'dv-ask-go', 'Pedir ' + posName(c, pk));
    } else if (uiOpen === 'ask' && !w) {
      h += '<div class="cdv-list sp-rows-2" role="group" aria-label="Pedir otro puesto">' + others.map(function (p, i) {
        var A = askChance(c, p), nm = posName(c, p) + (hall(c) || !c.mate ? '' : ' (y ' + String(c.mate.name).split(' ')[0] + ' ' + (p === 'cr' ? 'a la red' : 'atrás') + ')');
        var sub = 'Encaje ' + fit(c, p) + ' %';
        return '<button class="cdv-row sp-btn sp-wide sp-calm sp-lrow ' + (i % 2 ? 'sp-alt' : 'sp-ink') + '" data-shape="' + i + '" data-act="dv-ask-' + p + '" aria-label="' + esc(H, 'Pedir pasar a ' + nm + '. ' + sub + '. ' + A.lab) + '">' +
          '<span class="sp-rm"><span class="sp-t">' + esc(H, nm) + '</span><small class="sp-s">' + esc(H, sub) + '</small></span>' +
          '<span class="sp-rt"><span class="sp-chip cdv-chip cdv-' + (A.ch >= 0.6 ? 'hi' : A.ch >= 0.3 ? 'md' : 'lo') + '">' + esc(H, A.lab) + '</span></span></button>';
      }).join('') + '</div>';
    }
    return h + flashHTML(H, 'state') + '</div>';
  }
  function uiState(c, H) {
    if (!c || !c.player || c.phase === 'pick' || !myClub(c)) return '';
    if (demoShow) showSoon(demoShow);
    return planCard(c, H) + posCard(c, H);
  }
  /** Solo las pantallas de muestra (mobaudit): con una tarjeta de lesión u otras delante, la lista desplegada quedaba fuera de la
   *  vista. Tras el pintado lleva su tarjeta arriba dentro del desplazamiento (al tocar el botón ya lo hace el foco de act). */
  function showSoon(sel) {
    demoShow = '';
    if (typeof document === 'undefined' || typeof setTimeout !== 'function') return;
    setTimeout(function () {
      try {
        var el = document.querySelector('#career ' + sel); if (!el) return;
        if (VB.Splat && VB.Splat.reveal) VB.Splat.reveal(el, { block: 'start' }); else if (el.scrollIntoView) el.scrollIntoView({ block: 'start' });
      } catch (e) { }
    }, 0);
  }
  /** Palmarés › Opciones (pista): el selector libre de puesto se va (hide 'setpos'); el cambio se pide al entrenador. */
  function uiOpts(c, H) {
    if (!hall(c) || !c.player || c.phase === 'pick') return '';
    return '<div class="card cdv-opt"><h3>' + spH(H, ['Puesto', esc(H, posName(c, curPos(c)))], 'd') + '</h3>' +
      '<p class="muted">Tu puesto se cambia en Jugador › Estado: pídeselo al entrenador. En pretemporada siempre dice que sí.</p>' +
      '<div class="acts"><button class="sp-btn sp-md sp-teal" data-tab="player" data-s="train">' + lbl(H, 'Ir a Jugador › Estado') + '</button></div></div>';
  }
  function dot(c, where) { return where === 'match' && !!(c && c.dev && c.dev.pos && c.dev.pos.off); }
  function css() {
    var Q = ':root:not(#_):not(#_):not(#_) #career', PQ = ':root.ph:not(#_):not(#_):not(#_) #career';
    return ['/* ---- career-dev: cambio de puesto y plan de desarrollo ---- */',
      Q + ' .cdv-why{margin:6px 0 8px;padding-left:20px}',
      Q + ' .cdv-why li{margin:3px 0;line-height:1.35}',
      Q + ' .cdv-cost{margin:6px 0;font-weight:700}',
      Q + ' .cdv-attrs{margin:8px 0}',
      Q + ' .cdv-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;margin:10px 0 4px}',
      Q + ' .cdv-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;min-height:52px;padding:6px 14px;text-align:left;white-space:normal}',
      // (dos columnas: el texto y el chip; con #career gana a la rejilla de 3 de .sp-lrow del móvil, que espera un .sp-rl delante)
      Q + ' .cdv-row>.sp-rm{grid-column:1;display:flex;flex-direction:column;gap:2px;min-width:0}',
      Q + ' .cdv-row>.sp-rt{grid-column:2;margin-left:8px}',
      Q + ' .cdv-row .sp-s{font-size:13px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      Q + ' .cdv-row .sp-rt{display:flex;align-items:center;justify-content:flex-end}',
      Q + ' .cdv-chip{font-size:12px;white-space:nowrap}',
      Q + ' .cdv-pb.cdv-cur span:first-child{font-weight:800}',
      Q + ' .cdv-pb.cdv-cur .bar i{background:#ffd23f}',
      Q + ' .cdv-note{margin:8px 0}',
      '/* — móvil (.ph) — */',
      PQ + ' .cdv-why li,' + PQ + ' .cdv-cost,' + PQ + ' .cdv-attrs{font-size:var(--ph-body)}',
      PQ + ' .cdv-list{grid-template-columns:minmax(0,1fr);gap:var(--ph-hit-gap,10px)}',
      PQ + ' .cdv-list.sp-rows-2{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}',
      PQ + ' .cdv-row{min-height:56px}',
      PQ + ' .cdv-row .sp-s{font-size:var(--ph-label)}',
      PQ + ' .cdv-chip{font-size:var(--ph-cap)}',
      PQ + ' .cdv-note{font-size:var(--ph-body)}',
      // (Partido: la propuesta arriba del todo, delante del brochazo del próximo partido —.cr-next/.cr-two van a order:-2—. Con avisos,
      //  .cr-two lleva dentro el ticket, Faro y los avisos y la dejaba al fondo; «Jugar partido» sigue a mano en la barra de abajo)
      PQ + ' #crBody[data-cv^="match"]>.cdv-off{order:-3}',
      // (plan y puesto: el «?» junto al título y el botón en la misma fila, a la derecha. Al pie de la tarjeta quedaba medio cortado justo encima de
      //  la barra de abajo de Estado, «Ir al plan del entrenador», y se solapaba con ella; si no cabe al lado del título, baja a la línea
      //  siguiente, todavía arriba)
      PQ + ' .card:is(.cdv-plan,.cdv-pos){display:flex;flex-wrap:wrap;align-items:center;column-gap:var(--ph-s3,12px);row-gap:var(--ph-s2,8px)}',
      PQ + ' .card:is(.cdv-plan,.cdv-pos)>*{flex:1 1 100%;order:4;min-width:0}',
      PQ + ' .card:is(.cdv-plan,.cdv-pos)>.cdv-list{order:3;margin:2px 0 6px}',   // (la lista desplegada, justo bajo el título y su botón)
      PQ + ' .card:is(.cdv-plan,.cdv-pos)>h3:first-child{flex:0 1 auto;order:0;margin-right:0}',
      PQ + ' .card:is(.cdv-plan,.cdv-pos)>.acts.cdv-ha{flex:0 0 auto;order:2;margin:0 0 0 auto;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--ph-hit-gap,10px)}',
      PQ + ' .card:is(.cdv-plan,.cdv-pos)>.acts.cdv-ha>.sp-btn{flex:0 0 auto;min-height:44px;margin:0}',
      PQ + ' .card.card:is(.cdv-plan,.cdv-pos)>.cr-q{flex:0 0 44px;order:1;position:relative;top:auto;right:auto}'
    ].join('\n');
  }
  function curC() { var X = C(); try { return X && X.get ? X.get() : null; } catch (e) { return null; } }
  /** Acciones dv-… de la interfaz. Guarda. */
  function act(a, b) {
    var c = curC(); if (!c || !c.player) return false;
    ensure(c);
    var res;
    if (a === 'dv-go-state') return { tab: 'player', s: 'train', focus: '[data-act="dv-plan-open"]' };
    if (a === 'dv-pos-ok') {
      var to = c.dev.pos.off && c.dev.pos.off.to;
      if (!accept(c)) return false;
      save(c); uiOpen = '';
      flash = { where: 'match', txt: 'Hecho: ahora juegas de ' + low(posName(c, to)) + '. ' + (c.dev.plan ? 'Tienes un plan de ' + low(PLANS[c.dev.plan.k].name) + ' en Jugador › Estado.' : ''), go: true };
      return { render: true, focus: '[data-act="dv-go-state"]', setter: to === 'S' };
    }
    if (a === 'dv-pos-no') {
      if (!reject(c)) return false;
      save(c);
      flash = { where: 'match', txt: 'Sigues de ' + low(posName(c, curPos(c))) + '. Al entrenador no le ha gustado.' };
      return { render: true, focus: '[data-act="play"]' };
    }
    if (a === 'dv-plan-go' || a === 'dv-ask-go') {   // (móvil: confirma lo elegido en la lista)
      var pw = a === 'dv-plan-go' ? 'plan' : 'ask', pv = pick && pick.where === pw ? pick.k : ''; pick = null;
      if (!pv) return false;
      a = (pw === 'plan' ? 'dv-plan-' : 'dv-ask-') + pv;
    } else if (phNow() && a !== 'dv-plan-open' && a !== 'dv-ask-open' && a !== 'dv-plan-stop' && (a.indexOf('dv-plan-') === 0 || a.indexOf('dv-ask-') === 0)) {
      var pw2 = a.indexOf('dv-plan-') === 0 ? 'plan' : 'ask', pk2 = a.slice(pw2 === 'plan' ? 8 : 7);
      if (pw2 === 'plan' ? !PLANS[pk2] : posList(c).indexOf(pk2) < 0) return false;
      pick = pick && pick.where === pw2 && pick.k === pk2 ? null : { where: pw2, k: pk2 };   // (otra vez la misma: la suelta)
      return { render: true, snd: 'select', focus: '[data-act="' + a + '"]' };
    }
    if (a === 'dv-plan-open' || a === 'dv-ask-open') pick = null;
    if (a === 'dv-plan-open') { uiOpen = uiOpen === 'plan' ? '' : 'plan'; return { render: true, focus: uiOpen ? '[data-act^="dv-plan-"][aria-pressed]' : '[data-act="dv-plan-open"]' }; }
    if (a === 'dv-ask-open') { uiOpen = uiOpen === 'ask' ? '' : 'ask'; return { render: true, focus: uiOpen ? '[data-act^="dv-ask-"]:not([data-act="dv-ask-open"])' : '[data-act="dv-ask-open"]' }; }
    if (a === 'dv-plan-stop') { if (!stopPlan(c)) return false; save(c); uiOpen = ''; flash = { where: 'plan', txt: 'Plan dejado: la mejora vuelve a ir al atributo más bajo de cada grupo.' }; return { render: true, focus: '[data-act="dv-plan-open"]' }; }
    if (a.indexOf('dv-plan-') === 0) {
      var k = a.slice(8); if (!PLANS[k]) return false;
      if (!setPlan(c, k)) return false;
      save(c); uiOpen = '';
      flash = { where: 'plan', txt: 'Plan de ' + low(PLANS[k].name) + ' en marcha: ' + N.PLAN_LEN + ' jornadas.' };
      return { render: true, focus: '[data-act="dv-plan-open"]' };
    }
    if (a.indexOf('dv-ask-') === 0) {
      var p = a.slice(7);
      res = ask(c, p);
      if (!res.ok) return false;
      save(c); uiOpen = '';
      flash = { where: 'state', txt: (res.yes ? 'Sí: ' : 'No: ') + res.text };
      return { render: true, focus: '.cdv-pos button:not([disabled])', ok: res.yes, setter: res.yes && p === 'S' };
    }
    return null;
  }

  // ------------------------------------------------------------------ capturas y pruebas
  /** Pantallas de muestra (mobaudit): 'pos' fuerza una propuesta (la mejor, aunque no llegue al mínimo); 'planOpen' y 'askOpen'
   *  despliegan las listas. Guarda. true si la deja lista. */
  function demo(c, kind) {
    c = c || curC(); if (!c || !c.player || !myClub(c)) return false;
    var d = ensure(c);
    if (kind === 'pos') {
      if (!d.pos.off) {
        var mv = bestMove(c), cur = curPos(c);
        // (sin destino «con sentido» —s.use—, la mejor puntuación de los demás puestos: la captura siempre abre)
        if (!mv) posList(c).forEach(function (p) { if (p === cur) return; var s = scoreOf(c, p); if (!mv || s.s > mv.s) mv = s; });
        if (!mv) return false;
        propose(c, mv); d.pos.nS = Math.max(0, d.pos.nS - 1);
      }
      save(c); return true;
    }
    if (kind === 'planOpen') { uiOpen = 'plan'; demoShow = '.cdv-plan'; save(c); return true; }
    if (kind === 'askOpen') { if (askOk(c) === 'wait') d.pos.askT = -99; d.pos.off = null; uiOpen = 'ask'; demoShow = '.cdv-pos'; save(c); return true; }
    return false;
  }

  var DEV = {
    id: 'dev', N: N, PLANS: PLANS, PLAN_KEYS: PLAN_KEYS, REC: REC,
    ensure: ensure, hook: hook, trainProg: trainProg, trainPick: trainPick, sessMul: sessMul,
    fit: fit, fits: fits, fitN: fitN, keyAttrs: keyAttrs, rankIn: rankIn, needOf: needOf, scoreOf: scoreOf, bestMove: bestMove, canPropose: canPropose,
    offerOf: offerOf, propose: propose, accept: accept, reject: reject, ask: ask, askOk: askOk, askChance: askChance,
    setPlan: setPlan, stopPlan: stopPlan, planInfo: planInfo, posList: posList,
    posInfo: function (c) { var d = ensure(c); return d ? { cur: curPos(c), off: d.pos.off, adapt: d.pos.adapt, fits: fits(c), ask: askOk(c) } : null; },
    ui: { matchTop: uiMatchTop, match: uiMatch, state: uiState, opts: uiOpts }, act: act, dot: dot, css: css,
    _demo: demo, debug: function (kind) { return demo(null, kind); },
    _ui: function () { return { open: uiOpen, flash: flash, pick: pick }; }, _uiReset: function () { uiOpen = ''; flash = null; demoShow = ''; pick = null; }
  };
  VB.CareerDev = DEV;
  (VB.CareerExt = VB.CareerExt || []).push(DEV);
  (VB.CareerUIExt = VB.CareerUIExt || []).push({ id: 'dev', prefix: 'dv-', hide: ['setpos'], ui: DEV.ui, act: act, dot: dot, css: css });
})(typeof window !== 'undefined' ? window : globalThis);
