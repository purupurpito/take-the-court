/* MAKE THE CUT — js/career-train.js (owner: ui_main)
 * Entrenos con el club (VB.CareerTrain, sprint 2-4, tarea T12; spec T-training): una sesión opcional por jornada, encima del enfoque
 * semanal de career.js (trainWeek), con 1-3 ejercicios del Entrenamiento (VB.Gym) que elige Faro o el entrenador según tus puntos
 * flojos, tu puesto, tu enfoque y el rival. Cada ejercicio jugado da progreso a SU atributo (c.tpa; cada 100, +1); al cerrar la sesión,
 * la nota (bronce, plata u oro) da confianza del entrenador, química y, en la pista, un bono para el seis de la PRÓXIMA jornada
 * (selBonus, que lee lineup6). En duelos, semifinales, finales y rondas KO, plata u oro dan un bono solo para ese partido (prep, que
 * aplica el gancho 'setup'). Simularla da la mitad de progreso y nada más. Saltarla deja la Carrera exactamente como hoy.
 * Vale para las DOS Carreras: playa (c.mode ausente) y pista (c.mode 'hall'). Sin DOM (se carga en node: tools/traintest.js).
 * Estado dentro del guardado de la Carrera (sin subir VER ni VER6; ensure() crea y sanea lo que falte):
 *   c.ses     {k, kind:'week'|'pre'|'plan', who:'faro'|'coach', d:[ids], why:[str], line, r:[{id, m, p, tp, u}], st:'open'|'done'|'sim',
 *              g:-1..3, prep:null|{k:attr, v:1|2}, dc, dch, up:[attr]} | null
 *   c.tpa     {serve, recv, set, spike, block} (0-99)   c.sesN [sin, bronce, plata, oro]   c.sesSim n   c.sesOpt 'full'|'short'|'off'
 *   c.sesLast null | {k, g, sim:0|1}: la sesión de la ÚLTIMA jornada cerrada (la pone el gancho 'match' o cur al cambiar de jornada;
 *             sin sesión en esa jornada, null). selBonus solo la cuenta si es de una jornada anterior a la actual.
 * Azar: el de la Carrera (K()._rng(K()._hash(c.seed, 'ses', k, id))), nunca g.rng. No toca voley3d.gym ni la XP de Partido rápido.
 * career.js llama a hook(c, tipo, a) desde life(), después de CareerLife y CareerWorld. Sin este fichero, la Carrera queda igual.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  function K() { return VB.Career; }
  function W() { return VB.CareerWorld; }
  function KB() { var C = K(); return C && C.beach || C; }
  // Motor de la carrera c (como career-world.js): la fachada VB.Career va a la Carrera ACTIVA; aquí, a la de c. Pista: «pista sobre playa».
  var HV = null, HVsrc = null;
  function isH(c) { return !!(c && c.mode === 'hall'); }
  function E(c) {
    var C = K(); if (!c || !C || !C.beach) return C;
    if (!isH(c) || !C.hall) return C.beach;
    if (HVsrc !== C.hall) { HVsrc = C.hall; HV = {}; var k; for (k in C.beach) HV[k] = C.beach[k]; for (k in C.hall) HV[k] = C.hall[k]; }
    return HV;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clampI(v, a, b) { v = Math.round(+v); return isFinite(v) ? clamp(v, a, b) : a; }
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function rnd(c, k, id) { var C = KB(); return C && C._rng ? C._rng(C._hash(c.seed, 'ses', k, id))() : 0.5; }

  // ------------------------------------------------------------------ constantes (T-training §2.4)
  var IDS = ['serve', 'recv', 'set', 'atk', 'block'];
  var ATTR_L = { serve: 'serve', recv: 'recv', set: 'set', atk: 'spike', block: 'block' };   // copia de VB.Gym.ATTR (R19: la pone T13)
  var TPA_KEYS = ['serve', 'recv', 'set', 'spike', 'block'];
  var TP = [5, 12, 20, 30];          // progreso por ejercicio según medalla (sin medalla, 5: has ido a entrenar)
  var COACH = [0, 0, 1, 2];          // confianza del entrenador por nota de la sesión
  var CHEM_B = [1, 1, 2, 3];         // química con tu pareja (playa, c.mate.chem)
  var CHEM_H = [0, 1, 1, 2];         // química del equipo (pista, c.chem)
  var SEL = [0, 0, 0.5, 1];          // pista: bono para la siguiente elección del seis (lineup6)
  var PRE_MUL = 1.5, SIM_MUL = 0.5, NEED = 100, LINE_MAX = 160;
  var POOL = {
    beach: { atk: ['atk', 'block', 'serve', 'recv'], cr: ['recv', 'set', 'serve', 'block'], uni: IDS },
    hall: { S: ['set', 'serve', 'block'], OPP: ['atk', 'block', 'serve'], OH: ['recv', 'atk', 'serve'], MB: ['block', 'atk', 'serve'], L: ['recv', 'set'] }
  };
  var RIVAL_DRILL = { 'Ofensivo': 'block', 'Defensivo': 'atk', 'Saque y bloqueo': 'recv', 'Juego rápido': 'block', 'Equilibrado': '' };
  var RIVAL_TXT = { 'Ofensivo': 'ataca mucho', 'Defensivo': 'lo defiende todo', 'Saque y bloqueo': 'saca fuerte', 'Juego rápido': 'juega muy rápido' };
  var FOCUS_DRILL = { def: ['recv', 'block'], atk: ['serve', 'set', 'atk'], phys: ['block', 'recv'] };
  var W_RIVAL = 12, W_FOCUS = 6, W_NOISE = 3;
  var LINES = {
    weak: 'Tu {attrL} es lo más flojo ahora mismo ({v}). Hoy, {drillL}.',
    rival: '{rivalShort} {estilo}: toca {drillL}.',
    both: 'Tu {attrL} anda en {v} y {rivalShort} {estilo}. Hoy, {drillL1} y {drillL2}.',
    pre: 'Pretemporada. Tres ejercicios para ver cómo llegas, sin presión.',
    plan: 'Es {cual}. Plan de partido: {drillL1}. Con plata u oro sales con +1 en {attrL}.',
    bench: 'Aunque no juegues, el entrenador lo ve.'
  };
  var PLAN_WHAT = { duel: 'el duelo', semi: 'la semifinal', final: 'la final', ko: 'la eliminatoria' };
  var MEDAL_NAMES = ['Sin medalla', 'Bronce', 'Plata', 'Oro'];
  var MEDALS_L = { serve: [12, 18, 24], recv: [18, 24, 28], set: [16, 22, 27], atk: [12, 18, 23], block: [6, 11, 16] };
  var DRILL_SHORT = { serve: 'Saque', recv: 'Recepción', set: 'Colocación', atk: 'Remate', block: 'Bloqueo' };
  var LABEL_L = { serve: 'Saque', recv: 'Recepción', set: 'Colocación', spike: 'Potencia', block: 'Bloqueo' };

  function ATTR() { return VB.Gym && VB.Gym.ATTR || ATTR_L; }
  function attrOf(id) { return ATTR()[id] || ATTR_L[id]; }
  function drillShort(id) { var d = VB.Gym && VB.Gym.drill ? VB.Gym.drill(id) : null; return d && d.short || DRILL_SHORT[id] || id; }
  function attrLabel(a) { var L = VB.Prog && VB.Prog.LABEL; return L && L[a] || LABEL_L[a] || a; }
  function medalsOf(id) { return VB.Gym && VB.Gym.medalsOf ? VB.Gym.medalsOf(id) || MEDALS_L[id] : MEDALS_L[id]; }
  function medalOf(id, total) {
    if (VB.Gym && VB.Gym.medalOf) return VB.Gym.medalOf(id, total) | 0;
    var t = MEDALS_L[id]; if (!t) return 0; total = +total || 0;
    return total >= t[2] ? 3 : total >= t[1] ? 2 : total >= t[0] ? 1 : 0;
  }
  function fill(s, v) { return String(s).replace(/\{(\w+)\}/g, function (a, k) { return v && v[k] != null ? String(v[k]) : ''; }); }
  function lc(s) { return String(s).toLowerCase(); }
  function andList(a) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1]; }

  // ------------------------------------------------------------------ estado
  function okSes(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
    if (!isInt(s.k) || ['week', 'pre', 'plan'].indexOf(s.kind) < 0 || ['faro', 'coach'].indexOf(s.who) < 0) return false;
    if (!Array.isArray(s.d) || s.d.length < 1 || s.d.length > 3) return false;
    for (var i = 0; i < s.d.length; i++) if (IDS.indexOf(s.d[i]) < 0 || s.d.indexOf(s.d[i]) !== i) return false;
    if (['open', 'done', 'sim'].indexOf(s.st) < 0 || !Array.isArray(s.r) || s.r.length > s.d.length) return false;
    var seen = {};
    for (var j = 0; j < s.r.length; j++) {
      var e = s.r[j];
      if (!e || typeof e !== 'object' || s.d.indexOf(e.id) < 0 || seen[e.id]) return false;
      seen[e.id] = 1;
      e.m = clampI(e.m, 0, 3); e.p = clampI(e.p, 0, 40); e.tp = clampI(e.tp, 0, 60); e.u = e.u ? 1 : 0;
    }
    return true;
  }
  /** Sanea (y crea si faltan) c.ses, c.tpa, c.sesN, c.sesSim, c.sesOpt y c.sesLast. Lo que no valida se borra. */
  function ensure(c) {
    if (!c || typeof c !== 'object') return null;
    var t = c.tpa;
    if (!t || typeof t !== 'object' || Array.isArray(t)) t = c.tpa = {};
    for (var k in t) if (TPA_KEYS.indexOf(k) < 0) delete t[k];
    TPA_KEYS.forEach(function (a) { t[a] = clampI(t[a] || 0, 0, NEED - 1); });
    if (!Array.isArray(c.sesN) || c.sesN.length !== 4) c.sesN = [0, 0, 0, 0];
    c.sesN = c.sesN.map(function (v) { return clampI(v || 0, 0, 1e6); });
    c.sesSim = clampI(c.sesSim || 0, 0, 1e6);
    if (['full', 'short', 'off'].indexOf(c.sesOpt) < 0) c.sesOpt = 'full';
    var L = c.sesLast;
    if (L != null && !(L && typeof L === 'object' && isInt(L.k) && isInt(L.g) && L.g >= -1 && L.g <= 3)) c.sesLast = null;
    else if (L) c.sesLast = { k: L.k, g: L.g, sim: L.sim ? 1 : 0 };
    var s = c.ses;
    if (s != null) {
      if (!okSes(s)) c.ses = null;
      else {
        s.why = Array.isArray(s.why) ? s.why.filter(function (x) { return typeof x === 'string'; }).slice(0, 6).map(function (x) { return x.slice(0, 40); }) : [];
        s.line = typeof s.line === 'string' ? s.line.slice(0, LINE_MAX) : '';
        s.g = isInt(s.g) ? clamp(s.g, -1, 3) : -1;
        var vals = TPA_KEYS;
        s.prep = s.prep && typeof s.prep === 'object' && vals.indexOf(s.prep.k) >= 0 && (s.prep.v === 1 || s.prep.v === 2) ? { k: s.prep.k, v: s.prep.v } : null;
        s.dc = clampI(s.dc || 0, -100, 100); s.dch = clampI(s.dch || 0, -100, 100);
        s.up = Array.isArray(s.up) ? s.up.filter(function (a) { return vals.indexOf(a) >= 0; }).slice(0, 3) : [];
      }
    }
    return c;
  }
  function load() { var C = K(); if (!C) return null; try { return C.load ? C.load() : C.get(); } catch (e) { return null; } }
  function save(c) { var X = E(c); if (X && X.save) X.save(c); }
  function wk(c) { var X = E(c); return X && X._wkKey ? X._wkKey(c) : 0; }
  function liveOk(c) { return !!(c && c.myClub >= 0 && ['league', 'cup', 'ko'].indexOf(c.phase) >= 0); }
  function rOf(s, id) { for (var i = 0; i < s.r.length; i++) if (s.r[i].id === id) return s.r[i]; return null; }
  function pendOf(s) { if (!s || s.st !== 'open') return null; for (var i = 0; i < s.d.length; i++) if (!rOf(s, s.d[i])) return s.d[i]; return null; }

  // ------------------------------------------------------------------ planificar (determinista)
  function poolOf(c) {
    var rk = c.player && c.player.roleKey;
    return (isH(c) ? POOL.hall[rk] : POOL.beach[rk]) || (isH(c) ? POOL.hall.OH : IDS);
  }
  function rivalStyle(c, n) { try { var X = E(c), inf = n && n.rival ? X.clubInfo(c, n.rival) : null; return inf && inf.style || ''; } catch (e) { return ''; } }
  function planWhat(c, n) {
    if (n.kind === 'cup') return n.round === 1 ? 'final' : 'semi';
    if (n.kind === 'ko') {
      var ko = c.kos && c.kos[n.ko], rd = ko && ko.rounds && ko.rounds[n.round], pairs = rd ? rd.length : 9;
      return pairs <= 1 ? 'final' : pairs === 2 ? 'semi' : 'ko';
    }
    return 'duel';
  }
  /** Sesión de la jornada k (sin guardarla): {k, kind, who, d, why, line, r, st, g, prep, dc, dch, up}. null sin partido tuyo. */
  function plan(c, k) {
    if (!ensure(c) || !liveOk(c)) return null;
    var X = E(c), n = null;
    try { n = X.next(c); } catch (e) { n = null; }
    if (!n) return null;
    if (k == null) k = wk(c);
    var st = c.player.st, pool = poolOf(c);
    var duel = !!(c.life && c.life.rival && n.rival && c.life.rival.club === n.rival.id);
    var kind = c.phase === 'league' && (c.week | 0) === 0 ? 'pre' : duel || n.kind === 'cup' || n.kind === 'ko' ? 'plan' : 'week';
    var who = kind !== 'plan' && (!W() || !W().mentorOn || W().mentorOn(c)) ? 'faro' : 'coach';
    var style = rivalStyle(c, n), rd = RIVAL_DRILL[style] || '';
    if (pool.indexOf(rd) < 0) rd = '';
    var foc = FOCUS_DRILL[c.train] || [];
    var sc = pool.map(function (id) {
      var v = st[attrOf(id)] | 0;
      return { id: id, v: v, s: 99 - v + (id === rd ? W_RIVAL : 0) + (foc.indexOf(id) >= 0 ? W_FOCUS : 0) + W_NOISE * rnd(c, k, id) };
    });
    sc.sort(function (a, b) { return b.s - a.s || (a.id < b.id ? -1 : 1); });
    var base = kind === 'pre' ? 3 : 2;
    if (c.sesOpt === 'short') base = Math.max(kind === 'pre' ? 2 : 1, base - 1);
    var cnt = Math.min(base, pool.length), d;
    if (kind === 'plan') {
      var weak = sc.slice().sort(function (a, b) { return a.v - b.v || (a.id < b.id ? -1 : 1); })[0].id, first = rd || weak;
      d = [first].concat(sc.filter(function (x) { return x.id !== first; }).map(function (x) { return x.id; })).slice(0, cnt);
    } else d = sc.slice(0, cnt).map(function (x) { return x.id; });
    // frase de quien elige
    var vOf = function (id) { return st[attrOf(id)] | 0; };
    var weakIn = d.slice().sort(function (a, b) { return vOf(a) - vOf(b) || (a < b ? -1 : 1); })[0];
    var rivalShort = n.rival ? n.rival.short || n.rival.name : '', estilo = RIVAL_TXT[style] || '';
    var dl = d.map(function (id) { return lc(drillShort(id)); }), why = [], line;
    if (kind === 'pre') { line = LINES.pre; why.push('pre'); }
    else if (kind === 'plan') {
      var what = planWhat(c, n);
      line = fill(LINES.plan, { cual: PLAN_WHAT[what], drillL1: dl[0], attrL: lc(attrLabel(attrOf(d[0]))) });
      why.push('plan:' + what); if (rd && d[0] === rd) why.push('rival:' + rd); else why.push('weak:' + d[0]);
    } else if (rd && d[0] === rd && estilo) {
      line = fill(LINES.rival, { rivalShort: rivalShort, estilo: estilo, drillL: andList(dl) }); why.push('rival:' + rd);
    } else if (rd && d.indexOf(rd) >= 0 && estilo && d.length >= 2) {
      line = fill(LINES.both, { attrL: lc(attrLabel(attrOf(d[0]))), v: vOf(d[0]), rivalShort: rivalShort, estilo: estilo, drillL1: dl[0], drillL2: andList(dl.slice(1)) });
      why.push('weak:' + d[0], 'rival:' + rd);
    } else {
      line = fill(LINES.weak, { attrL: lc(attrLabel(attrOf(weakIn))), v: vOf(weakIn), drillL: andList(dl) }); why.push('weak:' + weakIn);
    }
    if (n.bench) { line += ' ' + LINES.bench; why.push('bench'); }
    return { k: k, kind: kind, who: who, d: d, why: why, line: line.slice(0, LINE_MAX), r: [], st: 'open', g: -1, prep: null, dc: 0, dch: 0, up: [] };
  }

  // ------------------------------------------------------------------ progreso y cierre
  function trainMul(c) {
    if (isH(c)) return 1;
    var X = E(c);
    if (X && X._cd) { var d = X._cd(c); return d && d.train > 0 ? d.train : 1; }
    var B = KB(), D = B && B.CDIFF && B.diffOf ? B.CDIFF[B.diffOf(c)] : null;
    return D && D.train > 0 ? D.train : 1;
  }
  function mulOf(c, s) { return trainMul(c) * (s.kind === 'pre' ? PRE_MUL : 1); }
  /** Suma tp al progreso del atributo a; cada NEED, +1 al atributo (hasta 99). Devuelve cuántos ha subido. */
  function addTp(c, a, tp) {
    var st = c.player.st, up = 0;
    c.tpa[a] = (c.tpa[a] | 0) + tp;
    while (c.tpa[a] >= NEED) {
      if ((st[a] | 0) >= 99) { c.tpa[a] = NEED - 1; break; }
      c.tpa[a] -= NEED; st[a] = (st[a] | 0) + 1; up++;
    }
    return up;
  }
  function gradeOf(r) { if (!r.length) return -1; var s = 0; r.forEach(function (e) { s += e.m; }); return clamp(Math.floor(s / r.length + 0.34), 0, 3); }
  function sumOf(c, s) {
    return { k: s.k, kind: s.kind, st: s.st, g: s.g, medal: s.g > 0 ? MEDAL_NAMES[s.g] : MEDAL_NAMES[0], dc: s.dc, dch: s.dch, prep: s.prep ? { k: s.prep.k, v: s.prep.v } : null,
      up: s.up.slice(), r: s.r.map(function (e) { return { id: e.id, m: e.m, p: e.p, tp: e.tp, u: e.u }; }), sel: isH(c) && s.st === 'done' && s.g >= 0 ? SEL[s.g] : 0 };
  }
  /** Cierra una sesión jugada (aunque sea a medias): nota, confianza, química, plan de partido y cuenta de medallas. */
  function finishIn(c, s) {
    if (s.st !== 'open') return sumOf(c, s);
    var g = gradeOf(s.r);
    s.st = 'done'; s.g = g;
    if (g < 0) return sumOf(c, s);   // nada jugado: sin premio
    var X = E(c), c0 = clampI(c.coach, 0, 100);
    c.coach = Math.min(100, c0 + COACH[g]);
    if (X && X._coachFloor) { try { X._coachFloor(c); } catch (e) { } }
    s.dc = c.coach - c0;
    if (isH(c)) { var h0 = c.chem | 0; c.chem = clamp(h0 + CHEM_H[g], 0, 100); s.dch = c.chem - h0; }
    else if (c.mate) { var b0 = c.mate.chem | 0; c.mate.chem = clamp(b0 + CHEM_B[g], 0, 100); s.dch = c.mate.chem - b0; }
    if (s.kind === 'plan' && g >= 2 && rOf(s, s.d[0])) s.prep = { k: attrOf(s.d[0]), v: g === 3 ? 2 : 1 };
    c.sesN[g]++;
    return sumOf(c, s);
  }
  /** La sesión de otra jornada sale de c.ses: si quedó a medias con algo jugado, se cierra; pasa a c.sesLast. */
  function rollover(c) {
    var s = c.ses; if (!s) return false;
    if (s.st === 'open' && s.r.length) finishIn(c, s);
    c.sesLast = { k: s.k, g: s.st === 'open' ? -1 : s.g, sim: s.st === 'sim' ? 1 : 0 };
    c.ses = null;
    return true;
  }

  // ------------------------------------------------------------------ API
  /** Sesión de la jornada en curso (la crea si hace falta) o null (sin partido tuyo, fuera de temporada o con «No» en Opciones). */
  function cur(c) {
    c = c || load(); if (!ensure(c)) return null;
    var live = liveOk(c), key = live ? wk(c) : null, changed = false;
    if (c.ses && c.ses.k !== key) { rollover(c); changed = true; }
    if (live && c.sesOpt !== 'off' && !c.ses) { var p = plan(c, key); if (p) { c.ses = p; changed = true; beat1(c); } }
    if (changed) save(c);
    return live && c.sesOpt !== 'off' ? c.ses : null;
  }
  /** Id del siguiente ejercicio sin jugar de la sesión de esta jornada, o null. No crea la sesión. */
  function pending(c) { c = c || load(); if (!ensure(c) || !c.ses || c.ses.k !== wk(c)) return null; return pendOf(c.ses); }
  /** Opciones para main.js (startDrill con opts.ses), o null si id no está pendiente. */
  function drillSetup(id, c) {
    c = c || load(); var s = cur(c);
    if (!s || s.st !== 'open' || s.d.indexOf(id) < 0 || rOf(s, id)) return null;
    var X = E(c), H = isH(c), me = X.myClub(c); if (!me) return null;
    var genSt = X._genSt || X.genSt, keys = X.KEYS || ['jump', 'speed', 'react', 'recv', 'dig', 'set', 'spike', 'ctl', 'block', 'serve'];
    var CK = X.CHEM_KEYS || ['react', 'set', 'recv'];
    var avg = clampI(X.clubOvr ? X.clubOvr(me) : 50, 1, 99);
    var gen = function (o, role) {
      if (genSt) return genSt(clampI(o, 1, 99), role, null);
      var t = {}; keys.forEach(function (k) { t[k] = clampI(o, 1, 99); }); return t;
    };
    // tú: como en matchSetup (fatiga y química; el plan de partido no)
    var B = KB(), fm = B && B.fatigueMalus ? B.fatigueMalus(c) : 0, ch = X.chemBonus ? X.chemBonus(c) : 0;
    var stMe = copy(c.player.st);
    keys.forEach(function (k) { stMe[k] = clampI((stMe[k] | 0) - fm + (CK.indexOf(k) >= 0 ? ch : 0), 1, 99); });
    var stMate, mateNum;
    if (!H && c.mate && c.mate.st) {
      stMate = copy(c.mate.st); mateNum = c.mate.num | 0;
      keys.forEach(function (k) { stMate[k] = clampI((stMate[k] | 0) + (CK.indexOf(k) >= 0 ? ch : 0), 1, 99); });
    } else {
      var mpos = c.player.roleKey === 'S' ? 'OH' : 'S';
      stMate = gen(avg, mpos);
      var mq = c.sq6 && Array.isArray(c.sq6.list) ? c.sq6.list.filter(function (x) { return x && x.pos === mpos && x.num > 0; })[0] : null;
      mateNum = mq ? mq.num | 0 : 0;
    }
    if (!(mateNum > 0) || mateNum === (c.player.num | 0)) mateNum = ((c.player.num | 0) % 99) + 1;
    // sparring: media del club propio; en el plan de partido, la del rival
    var so = avg;
    if (s.kind === 'plan') { try { var n = X.next(c); if (n && n.rival && X.clubOvr) so = clampI(X.clubOvr(n.rival), 1, 99); } catch (e) { } }
    var spA = gen(so + 1, 'atk'), spB = gen(so - 1, 'cr');
    var bd = VB.Badges && VB.Badges.forPlayer ? VB.Badges.forPlayer(c.player) : null;
    if (bd && !Object.keys(bd).length) bd = null;
    var k = me.kit || {}, kit = { kitShirt: k.shirt, kitAccent: k.accent, kitShorts: k.shorts, kitPattern: k.pattern };
    if (H && k.libero != null) kit.kitLibero = k.libero;
    return {
      attrs: [[stMe, stMate], [spA, spB]], badges: bd ? [[bd, null], null] : null, venue: H ? 'hall' : 'beach',
      nums: [[c.player.num | 0, mateNum], [4, 9]], kit: kit,
      ses: { k: s.k, i: s.r.length + 1, n: s.d.length, who: s.who, mode: H ? 'hall' : 'beach', id: id, kind: s.kind }
    };
  }
  function resOf(c, s, e) {
    var a = attrOf(e.id), t = medalsOf(e.id), i = s.r.indexOf(e);
    return { id: e.id, medal: e.m, total: e.p, tp: e.tp, attr: a, v: c.player.st[a] | 0, up: !!e.u, pts: c.tpa[a] | 0, i: i + 1, n: s.d.length,
      next: pendOf(s), last: s.st !== 'open' || s.r.length >= s.d.length,
      toNext: e.m < 3 && t ? { m: e.m + 1, name: MEDAL_NAMES[e.m + 1], need: Math.max(1, t[e.m] - e.p) } : null };
  }
  function optC(o) { return o && typeof o === 'object' && o.player ? o : o && o.c ? o.c : null; }
  /** Apunta un ejercicio terminado (main/ui, en drillEnd). Idempotente. o = {c, dry}: dry calcula sin tocar el guardado. */
  function drillDone(id, total, reps, o) {
    var c = optC(o) || load(); if (!ensure(c)) return null;
    if (o && o.dry) c = ensure(copy(c));
    var s = c.ses; if (!s || s.k !== wk(c) || s.d.indexOf(id) < 0) return null;
    var ex = rOf(s, id); if (ex) return resOf(c, s, ex);
    if (s.st !== 'open') return null;
    var m = medalOf(id, total), a = attrOf(id), tp = Math.round(TP[m] * mulOf(c, s));
    var up = addTp(c, a, tp), e = { id: id, m: m, p: clampI(total, 0, 40), tp: tp, u: up ? 1 : 0 };
    s.r.push(e); if (up && s.up.indexOf(a) < 0) s.up.push(a);
    var res = resOf(c, s, e);
    if (s.r.length >= s.d.length) { res.sum = finishIn(c, s); res.last = true; res.next = null; }
    if (!(o && o.dry)) save(c);
    return res;
  }
  /** «Simular»: lo que falte, sin azar y sin oro, a la mitad de progreso; sin confianza, química ni bonos. */
  function simulate(o) {
    var c = optC(o) || load(), s = cur(c); if (!s || s.st !== 'open') return null;
    var mul = mulOf(c, s);
    s.d.forEach(function (id) {
      if (rOf(s, id)) return;
      var a = attrOf(id), m = clamp(Math.floor(((c.player.st[a] | 0) - 40) / 15), 0, 2), tp = Math.round(TP[m] * mul * SIM_MUL);
      var up = addTp(c, a, tp); s.r.push({ id: id, m: m, p: 0, tp: tp, u: up ? 1 : 0 });
      if (up && s.up.indexOf(a) < 0) s.up.push(a);
    });
    s.st = 'sim'; s.g = gradeOf(s.r); s.dc = 0; s.dch = 0; s.prep = null;
    c.sesSim++;
    save(c);
    return sumOf(c, s);
  }
  /** «Terminar aquí»: cierra la sesión de esta jornada con lo jugado. null si no hay nada jugado. */
  function finish(o) {
    var c = optC(o) || load(); if (!ensure(c)) return null;
    var s = c.ses; if (!s || s.k !== wk(c)) return null;
    if (s.st !== 'open') return sumOf(c, s);
    if (!s.r.length) return null;
    var out = finishIn(c, s); save(c); return out;
  }
  /** Palmarés › Opciones: 'full' | 'short' | 'off'. Una sesión aún sin empezar se rehace con la opción nueva. */
  function setOpt(v, o) {
    var c = optC(o) || load(); if (!ensure(c) || ['full', 'short', 'off'].indexOf(v) < 0) return '';
    c.sesOpt = v;
    var s = c.ses;
    if (s && s.st === 'open' && !s.r.length) {
      if (v === 'off') c.ses = null;
      else { var p = plan(c, s.k); c.ses = p && p.k === s.k ? p : c.ses; }
    }
    save(c); return v;
  }
  /** Pista: bono para la elección del seis (lineup6) por la sesión de la jornada anterior. Pura (no toca c). */
  function selBonus(c) {
    var L = c && c.sesLast;
    if (!L || typeof L !== 'object' || L.sim || !(L.g >= 0) || L.g > 3 || L.k === wk(c)) return 0;
    return SEL[L.g | 0] || 0;
  }
  /** Ganchos de career.js (life): 'setup' (plan de partido en tu hueco) y 'match' (la sesión de la jornada cerrada pasa a sesLast). */
  function hook(c, kind, a) {
    if (!c) return;
    if (kind === 'setup') {
      var s = c.ses; if (!s || !s.prep || !a || s.k !== wk(c)) return;
      var ix = a.format === '6v6' ? a.ctrlIdx | 0 : 0;
      var bst = a.format === '6v6' && a.meOn === false && a.bench && a.bench[0] && a.bench[0][a.meBench | 0] ? a.bench[0][a.meBench | 0].st : null;
      var st = bst || (a.attrs && a.attrs[0] && a.attrs[0][ix]); if (!st) return;
      st[s.prep.k] = clamp(Math.round((st[s.prep.k] | 0) + s.prep.v), 1, 99);
      a.prep = { k: s.prep.k, v: s.prep.v };
      if (a.career) a.career.prep = { k: s.prep.k, v: s.prep.v };
      return;
    }
    if (kind === 'match') {
      // la jornada ya está cerrada (career.js llama a life después de finishRound): su sesión pasa a sesLast; sin sesión, nada
      if (c.ses) { ensure(c); if (c.ses && c.ses.k !== wk(c)) rollover(c); }
      else if (c.sesLast) c.sesLast = null;
    }
    // 'join' / 'newSeason': nada. La escena «ses1» de Faro sale con la primera sesión que se crea (cur), también en guardados antiguos
  }
  /** Escena «El primer entreno» (career-world.js BEATS.ses1; beat() ya evita repetirla). */
  function beat1(c) {
    var w = W(); if (!w || !w._beat || !w.BEATS || !w.BEATS.ses1 || c.sesOpt === 'off') return;
    try { w._beat(c, 'ses1'); } catch (e) { }
  }

  VB.CareerTrain = {
    cur: cur, plan: plan, pending: pending, drillSetup: drillSetup, drillDone: drillDone, simulate: simulate, finish: finish, setOpt: setOpt, selBonus: selBonus,
    hook: hook, ensure: ensure, TP: TP, COACH: COACH, CHEM_B: CHEM_B, CHEM_H: CHEM_H, SEL: SEL,
    PRE_MUL: PRE_MUL, SIM_MUL: SIM_MUL, POOL: POOL, RIVAL_DRILL: RIVAL_DRILL, FOCUS_DRILL: FOCUS_DRILL, LINES: LINES, MEDAL_NAMES: MEDAL_NAMES, TPA_KEYS: TPA_KEYS,
    attrOf: attrOf, attrLabel: attrLabel, drillShort: drillShort, medalsOf: medalsOf, _rollover: rollover, _grade: gradeOf
  };
})();
