/* TAKE THE COURT — js/career-allstar.js (owner: estrellas)
 * Partido de las Estrellas y concursos de la Carrera (VB.CareerAllstar). Playa y pista. Sin DOM al cargar (se carga en node con vm);
 * genera HTML como texto para la interfaz de la Carrera (registro VB.CareerUIExt) y se engancha al núcleo por VB.CareerExt
 * (CONTRACT.md «Extensiones de la Carrera»). Las reglas de los concursos están en js/contest.js (VB.Contest).
 *
 * Cómo va (notes/carrera.md «Estrellas»):
 *  - Votación: tres jornadas antes de la mitad de la liga, la afición vota a lo mejor de tu liga (tu fama frente a la de una figura de
 *    tu liga, tu nota media, la tabla de tu club y tu media frente a las otras figuras; a más de 6 de la media del corte de tu grupo, el
 *    voto baja). «Pedir el voto» (una vez por jornada, hasta 3): +5 % de votos, entrenador −1. Calibrado (tools/allstartest.js §6):
 *    sin pedir el voto, te eligen en la 1ª temporada en ~10-20 % de las carreras.
 *  - Resultado a mitad de liga: entran 4 en la playa (Sol = 1º y 4º, Luna = 2º y 3º) y 12 en la pista por puesto (2 S, 4 OH, 2 OPP,
 *    4 MB). Sin votos, con buenas notas y la media del corte, te eligen los técnicos. Sin entrar, te invitan al concurso del golpe en
 *    el que estás entre los mejores del pool (playa: 2º; pista: 8º de 30).
 *  - Fin de semana (hasta tu siguiente jornada): Partido de las Estrellas (un set a 21, sin ambiente: ambiente.js no tiene un modo
 *    sin tarjetas ni protestas) y concursos de saques,
 *    recepción y remate (los ejercicios del Entrenamiento, 2 intentos, cuenta el mejor, marcas rivales fijas y a la vista). Lo que no
 *    juegues se simula al pasar de jornada. Premios: seguidores, dinero y una prenda la primera vez. Ni XP, ni atributos, ni títulos.
 *  - Palmarés: tarjeta propia «Estrellas y concursos» (no son títulos oficiales; ni legado ni logros).
 *
 * Guardado: c.allstar = {v:1, cur, log[≤40], got{srv,rcv,atk,mvp}, skip}; ensure(c) idempotente y sin tiradas (las partidas viejas
 * cargan). Azar solo por hash de la semilla: rng(c, 'as-…', …). La sim no cambia: el partido es un createGame normal y los concursos,
 * ejercicios normales.
 *
 * API (VB.CareerAllstar): enabled, ensure, hook, state, setup/done/quit (partido), drillSetup/drillDone/drillQuit (concursos),
 * simPart, simAll, camp, cardHTML, honorsHTML, css, act, dot, _demo, _endDemo, _drillDemo, _t (constantes y piezas para las pruebas).
 */
(function (root) {
  'use strict';
  var VB = root.VB = root.VB || {};

  // ------------------------------------------------------------------ constantes
  var ID = 'allstar', PTS = 21, LOG_MAX = 40, POOL_MAX = 32;
  var VOTE = { wF: 0.3, wN: 0.35, wC: 0.15, wO: 0.2, camp: 0.05, campMax: 3, tecUp: 1.35, tecReal: 3, tecGap: 0, fameTop: 20000, fameExp: 0.8, notaLo: [5, 5.6], show: 37, cut: 4, minWeeks: 8, lead: 3,
    gap0: 6, gapK: 0.06, gapMin: 0.35, invTop: 0.27,   // (media lejos del corte de tu grupo: × (1 − gapK por punto pasado gap0), mínimo gapMin; invitación: el puesto pool × invTop)
    rivF: [0.2, 0.4, 0.2], rivN: [0.25, 0.35, 0.3] };   // (rivales: fama = a + b·azar + c·tabla; nota = a + b·media + c·(azar − ½))
  var QUOTA6 = { S: 2, OH: 4, OPP: 2, MB: 4 }, POOL6 = { S: 5, OH: 10, OPP: 5, MB: 10 }, POS6_ORDER = ['S', 'OH', 'OPP', 'MB'];   // (pista: entran por puesto; candidatos ≈ 2,5 por plaza)
  var LV_MULT = [1, 2, 4, 8, 15], SALARY = [600, 1500, 4000, 9000, 20000];
  var FAME = { vote: 100, tec: 60, win: 40, mvp: 120 }, MVP_MONEY = 0.25, FATIGUE = 4;
  var TEAMS = [{ k: 'SOL', name: 'Equipo Sol', short: 'Sol' }, { k: 'LUN', name: 'Equipo Luna', short: 'Luna' }];
  var KITS = [
    { kitShirt: 0xff8c1a, kitAccent: 0xffd23f, kitShorts: 0x2b2b2b, kitPattern: 'liso', kitLibero: 0x7ae0c3 },
    { kitShirt: 0x2f55d4, kitAccent: 0x9ad1ff, kitShorts: 0xf2f2f2, kitPattern: 'liso', kitLibero: 0xff7aa8 }
  ];
  var SCRIM = { base: 0xff8c1a, shorts: 0x2b2b2b, bib0: 0xffd23f, bib1: 0x9ad1ff };
  var LOOKS = { srv: 'bandana', rcv: 'deporte', atk: 'cintaRizo', mvp: 'estrella' };
  var LOOK_N = { bandana: 'Pañuelo', deporte: 'Gafas deportivas', cintaRizo: 'Cinta de rizo', estrella: 'Estrella en la mejilla' };
  var PARTS = ['m', 'srv', 'rcv', 'atk'];
  var M_ST = ['pend', 'live', 'play', 'sim', 'watch', 'gone'], C_ST = ['pend', 'live', 'play', 'sim', 'gone'];
  var KEYS = ['jump', 'speed', 'react', 'recv', 'dig', 'set', 'spike', 'ctl', 'block', 'serve'];

  var A = { enabled: true };
  var more = {};   // (UI: rankings desplegados en la tarjeta; no se guarda)

  // ------------------------------------------------------------------ utilidades
  function obj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function nm(v, lo, hi, d) { v = +v; return isFinite(v) ? clamp(v, lo, hi) : d; }
  function str(s, n) { return typeof s === 'string' ? s.slice(0, n || 40) : ''; }
  function round1(v) { return Math.round(v * 10) / 10; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function num(v) { return String(Math.round(+v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function eur(v) { return num(v) + (Math.round(+v || 0) === 1 ? ' salpi' : ' salpis'); }   // la moneda del juego (24-nov-2026): salpis, no euros
  function ordn(n) { n = n | 0; return n + (n === 1 || n === 3 ? 'r' : 'º'); }
  function dec(v) { return v == null ? '' : String(round1(v)).replace('.', ','); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function hall(c) { return !!(c && c.mode === 'hall'); }
  function CT() { return VB.Contest || null; }
  function LF() { return VB.CareerLife || null; }
  function first(s) { return String(s || '').split(' ')[0]; }
  /** Motor de la carrera c (playa, o «pista sobre playa» con las claves de la playa que la pista no redefine: _rng, _msg, _genSt…). */
  var HV = null, HVsrc = null;
  function K(c) {
    var C = VB.Career; if (!C || !C.beach) return null;
    if (!hall(c) || !C.hall) return C.beach;
    if (HVsrc !== C.hall) { HVsrc = C.hall; HV = {}; var k; for (k in C.beach) HV[k] = C.beach[k]; for (k in C.hall) HV[k] = C.hall[k]; }
    return HV;
  }
  function rng(c) { var E = K(c), a = [c.seed].concat(Array.prototype.slice.call(arguments, 1)); return E._rng(E._hash.apply(null, a)); }
  function nameGen(r) { var H = VB.Career && VB.Career.hall; return H && H._name ? H._name(r) : 'Alex ' + Math.floor(r() * 90 + 10); }
  function ovrOf(st) { var s = 0; KEYS.forEach(function (k) { s += +st[k] || 0; }); return Math.round(s / KEYS.length); }
  function lvOf(c) {
    var L = LF(); if (L && L.lvlOf) { try { return clamp(L.lvlOf(c) | 0, 0, 4); } catch (e) { } }
    var k = K(c).myClub(c); return hall(c) ? 2 : clamp(k ? k.lvl | 0 : 0, 0, 4);
  }
  function myClub(c) { try { return c && c.myClub >= 0 ? K(c).myClub(c) : null; } catch (e) { return null; } }
  function lgKey(c) { var k = myClub(c); return k ? (hall(c) ? k.lid : k.lvl) : null; }
  function lgName(c) {
    var k = myClub(c); if (!k) return '';
    try { var L = hall(c) ? K(c).league(k.lid, c) : K(c).league(k.lvl); return L && L.name ? String(L.name) : ''; } catch (e) { return ''; }
  }
  function lgClubs(c) { var k = myClub(c); if (!k) return []; return hall(c) ? K(c).leagueClubs(c, k.lid) : K(c).clubsOf(c, k.lvl); }
  function clubOvr(c, k) { return hall(c) ? k.ovr | 0 : K(c).clubOvr(k); }
  function clubN(c, id) {
    var n = lgClubs(c).length, p = 0; try { p = K(c).posOf(c, id) | 0; } catch (e) { p = 0; }
    return n > 1 && p > 0 ? 1 - (p - 1) / (n - 1) : 0.5;
  }
  function role6(c) { var E = K(c); return E.ctrlRole ? E.ctrlRole(c) : (c.player.roleKey || 'OH'); }
  function posName(c, p) { var P = VB.Career && VB.Career.POS6; return hall(c) ? (P && P[p] ? P[p].name : p) : ''; }
  function blockedNow(c) { try { var X = VB.Career && VB.Career.ext; return X && X.blocked ? X.blocked(c, null) || null : null; } catch (e) { return null; } }
  function prologueOn(c) { var P = VB.CareerPrologue; try { return !!(P && P.active && P.active(c)); } catch (e) { return false; } }
  function save(c) { try { K(c).save(c); } catch (e) { } }
  function msg(c, t, x) { try { K(c)._msg(c, 'allstar', t, x); } catch (e) { } }
  function wall(c, a, t) { var S = VB.CareerStory; if (!S || !S.pushWall) return; try { S.pushWall(c, { a: a, t: t, v: { k: 'as' } }); } catch (e) { } }
  function media(c) { var S = VB.CareerStory; try { var m = S && S.cast ? S.cast(c).media : null; return m && m.digital ? m.digital : 'digital'; } catch (e) { return 'digital'; } }
  /** «del Circuito Nacional», «de la Hiperliga»: el nombre de la liga con su artículo. */
  function deL(n) { n = String(n || ''); return !n ? 'de tu liga' : /^Circuito/.test(n) ? 'del ' + n : 'de la ' + n; }
  function andList(a) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1]; }

  // ------------------------------------------------------------------ estado guardado
  function sanePart(p, k) {
    var ok = k === 'm' ? M_ST : C_ST;
    if (!obj(p)) return null;
    if (ok.indexOf(p.st) < 0) p.st = 'pend';
    p.n = nm(p.n, 0, 2, 0) | 0; p.at = nm(p.at, 0, 2, 0) | 0;
    p.best = nm(p.best, 0, 40, 0) | 0; p.rank = nm(p.rank, 0, 6, 0) | 0;
    p.fame = nm(p.fame, 0, 1e7, 0); p.money = nm(p.money, 0, 1e8, 0);
    p.look = str(p.look);
    if (k !== 'm') {
      p.riv = Array.isArray(p.riv) ? p.riv.filter(function (x) { return obj(x) && typeof x.nm === 'string'; }).slice(0, 6).map(function (x) { return { nm: str(x.nm), cid: x.cid, s: nm(x.s, 0, 40, 0) | 0, a: nm(x.a, 0, 99, 0) | 0 }; }) : [];
      p.mine = !!p.mine;
    } else {
      p.w = nm(p.w, -1, 1, -1) | 0; p.sc = Array.isArray(p.sc) && p.sc.length === 2 ? [nm(p.sc[0], 0, 99, 0) | 0, nm(p.sc[1], 0, 99, 0) | 0] : [0, 0];
      p.nota = p.nota == null ? null : nm(p.nota, 1, 10, null); p.mvp = str(p.mvp); p.mvpMe = !!p.mvpMe; p.me = !!p.me; p.watch = !!p.watch;
    }
    return p;
  }
  function saneCur(c, cur) {
    if (!obj(cur) || ['vote', 'event', 'done'].indexOf(cur.st) < 0) return null;
    cur.s = nm(cur.s, 0, 999, 0) | 0; cur.w0 = nm(cur.w0, 0, 99, 0) | 0; cur.wk = nm(cur.wk, 0, 99, 0) | 0;
    cur.camp = nm(cur.camp, 0, VOTE.campMax, 0) | 0; cur.cw = nm(cur.cw, -1, 999, -1) | 0; cur.dw = nm(cur.dw, -1, 999, -1) | 0;
    cur.lgName = str(cur.lgName); cur.fame = nm(cur.fame, 0, 1e8, 0); cur.money = nm(cur.money, 0, 1e9, 0);
    cur.pool = (Array.isArray(cur.pool) ? cur.pool : []).filter(function (x) { return obj(x) && typeof x.nm === 'string' && isFinite(+x.ovr); }).slice(0, POOL_MAX);
    cur.pool.forEach(function (x, i) {
      x.id = typeof x.id === 'string' && x.id ? x.id : 'p' + i; x.nm = str(x.nm); x.ovr = nm(x.ovr, 1, 99, 50) | 0; x.v = nm(x.v, 0, 100, 0);
      x.num = nm(x.num, 1, 99, 1) | 0; x.pos = str(x.pos, 4) || 'uni';
      if (!obj(x.st) || KEYS.some(function (k) { return !isFinite(+x.st[k]); })) {   // (atributos rotos: los de su media, sin ruido)
        var E = K(c); x.st = E && E._genSt ? E._genSt(x.ovr, x.pos, null) : {}; KEYS.forEach(function (k) { if (!isFinite(+x.st[k])) x.st[k] = x.ovr; });
      }
    });
    if (cur.sel != null && !(obj(cur.sel) && Array.isArray(cur.sel.teams) && cur.sel.teams.length === 2)) cur.sel = null;
    if (cur.sel) {
      var s = cur.sel; s.me = s.me === 'vote' || s.me === 'tec' ? s.me : ''; s.rank = nm(s.rank, 0, 99, 0) | 0; s.cut = nm(s.cut, 1, 12, VOTE.cut) | 0;
      s.votes = nm(s.votes, 0, 1e9, 0) | 0; s.mine = s.mine === 1 ? 1 : 0; s.inv = obj(s.inv) ? s.inv : {}; ['srv', 'rcv', 'atk'].forEach(function (k) { s.inv[k] = !!s.inv[k]; });
      s.teams = s.teams.map(function (t) { return Array.isArray(t) ? t.filter(function (x) { return typeof x === 'string'; }) : []; });
    }
    PARTS.forEach(function (k) { cur[k] = cur[k] == null ? null : sanePart(cur[k], k); });
    if (cur.st === 'event' && (!cur.sel || PARTS.some(function (k) { return !cur[k]; }))) cur.st = cur.sel ? 'done' : 'vote';
    if (cur.st !== 'done' && c && (c.season | 0) && cur.s !== (c.season | 0)) { cur.st = 'done'; cur.stale = 1; }   // (de otra temporada: cerrada, sin tiradas; ensure la pasa al historial)
    return cur;
  }
  function saneLog(e) {
    if (!obj(e)) return null;
    e.s = nm(e.s, 0, 999, 0) | 0; e.name = str(e.name); e.sel = e.sel === 'vote' || e.sel === 'tec' ? e.sel : ''; e.rank = nm(e.rank, 0, 99, 0) | 0;
    e.fame = nm(e.fame, 0, 1e8, 0); e.money = nm(e.money, 0, 1e9, 0);
    e.m = obj(e.m) ? e.m : {}; e.m.w = nm(e.m.w, -1, 1, -1) | 0; e.m.mine = e.m.mine === 1 ? 1 : 0; e.m.me = !!e.m.me; e.m.mvpMe = !!e.m.mvpMe; e.m.mvp = str(e.m.mvp);
    e.m.sc = Array.isArray(e.m.sc) && e.m.sc.length === 2 ? [nm(e.m.sc[0], 0, 99, 0) | 0, nm(e.m.sc[1], 0, 99, 0) | 0] : [0, 0]; e.m.how = str(e.m.how, 8);
    e.m.nota = e.m.nota == null ? null : nm(e.m.nota, 1, 10, null);
    e.ct = obj(e.ct) ? e.ct : {};
    ['srv', 'rcv', 'atk'].forEach(function (k) { var x = obj(e.ct[k]) ? e.ct[k] : {}; e.ct[k] = { rank: nm(x.rank, 0, 6, 0) | 0, s: nm(x.s, 0, 40, 0) | 0, how: str(x.how, 8) || 'no', win: str(x.win), ws: nm(x.ws, 0, 40, 0) | 0 }; });
    return e;
  }
  /** c.allstar al día (idempotente, sin tiradas): lo crea si falta y sanea lo que haya. */
  function ensure(c) {
    if (!obj(c)) return null;
    var a = c.allstar;
    if (!obj(a)) a = c.allstar = { v: 1, cur: null, log: [], got: {}, skip: 0 };
    a.v = 1;
    if (!Array.isArray(a.log)) a.log = [];
    if (a.log.length > LOG_MAX) a.log = a.log.slice(-LOG_MAX);
    for (var i = a.log.length - 1; i >= 0; i--) if (!saneLog(a.log[i])) a.log.splice(i, 1);
    if (!obj(a.got)) a.got = {};
    a.skip = nm(a.skip, 0, 999, 0) | 0;
    var ev = obj(a.cur) && a.cur.st === 'event';
    a.cur = a.cur == null ? null : saneCur(c, a.cur);
    if (a.cur && a.cur.stale) { delete a.cur.stale; if (ev && a.cur.sel && PARTS.every(function (k) { return !!a.cur[k]; })) closeQuiet(a, a.cur); }
    return a;
  }

  /** Cierre sin tiradas de un fin de semana de otra temporada que se quedó abierto (guardado raro): lo pendiente o a medias se da por
   *  perdido (partido sin resultado; concurso tuyo abandonado si no tenías marca), y la edición pasa al historial una sola vez. */
  function closeQuiet(a, cur) {
    var m = cur.m; if (m.st === 'pend' || m.st === 'live') { m.st = 'gone'; m.me = false; }
    ['srv', 'rcv', 'atk'].forEach(function (k) {
      var p = cur[k]; p.at = 0;
      if (p.st === 'pend' || p.st === 'live') { if (p.mine && p.best > 0) p.st = 'play'; else if (p.mine) { p.st = 'gone'; p.rank = CT() ? CT().N : 6; } else { p.st = 'sim'; p.rank = 0; } }
    });
    cur.dw = -1;
    if (!CT() || a.log.some(function (e) { return e.s === cur.s && e.name === cur.lgName; })) return;
    a.log.push(saneLog(logOf(null, cur))); if (a.log.length > LOG_MAX) a.log = a.log.slice(-LOG_MAX);
  }

  // ------------------------------------------------------------------ calendario
  function calOf(c) {
    var k = myClub(c); if (!k) return null;
    var E = K(c), weeks, mid;
    if (hall(c)) { weeks = E.weeksOf(c, k.lid) | 0; mid = E.midWeek(c) | 0; } else { weeks = E.WEEKS | 0; mid = E.MID_WEEK | 0; }
    if (weeks < VOTE.minWeeks || mid < 2) return null;
    return { mid: mid, w0: Math.max(1, mid - VOTE.lead), weeks: weeks };
  }

  // ------------------------------------------------------------------ candidatos (pool) y votos
  function poolOf(c) {
    var E = K(c), r = rng(c, 'as-pool', c.season | 0, String(lgKey(c))), out = [], names = {};
    names[c.player.name] = names[first(c.player.name)] = 1;
    if (c.mate && c.mate.name) names[c.mate.name] = 1;
    var fresh = function () { var n, g = 0; do { n = nameGen(r); } while ((names[n] || names[first(n)]) && g++ < 40); names[n] = names[first(n)] = 1; return n; };
    if (!hall(c)) {
      var t = E.table(c, myClub(c).lvl), top3 = t.slice(0, 3).map(function (x) { return x.id; }), rv = c.life && obj(c.life.rival) ? c.life.rival : null, roles = ['atk', 'uni', 'cr'];
      lgClubs(c).forEach(function (k) {
        if (k.id === c.myClub) return;
        var cnt = top3.indexOf(k.id) >= 0 ? 2 : 1;
        for (var i = 0; i < cnt; i++) {
          var o = clamp(Math.round(clubOvr(c, k) + (i === 0 ? r() * 3 : -1 - r() * 2)), 20, 99), role = roles[Math.floor(r() * 3) % 3], st = E._genSt(o, role, r);
          var useRv = i === 0 && rv && rv.club === k.id && rv.name && !names[rv.name];
          var n = useRv ? String(rv.name) : fresh(); if (useRv) names[n] = names[first(n)] = 1;
          out.push({ id: 'p' + out.length, nm: n, num: useRv && rv.num ? rv.num | 0 : 1 + Math.floor(r() * 23), cid: k.id, pos: role, ovr: ovrOf(st), st: st, v: 0 });
        }
      });
      if (c.mate && c.mate.st) out.push({ id: 'mate', nm: String(c.mate.name || fresh()), num: c.mate.num | 0 || 2, cid: c.myClub, pos: c.mate.roleKey || 'uni', ovr: ovrOf(c.mate.st), st: copy(c.mate.st), v: 0 });
    } else {
      var me = role6(c), cand = [];
      lgClubs(c).forEach(function (k) {
        var list = k.id === c.myClub && obj(c.sq6) && c.sq6.club === k.id && Array.isArray(c.sq6.list) ? c.sq6.list : E.squad(c, k, c.season, k.id === c.myClub ? me : '');
        (list || []).forEach(function (x) { if (x && QUOTA6[x.pos] && x.name) cand.push({ nm: String(x.name), num: x.num | 0, cid: k.id, pos: x.pos, ovr: x.ovr | 0 }); });
      });
      var avg = 0; lgClubs(c).forEach(function (k) { avg += clubOvr(c, k); }); avg = Math.round(avg / Math.max(1, lgClubs(c).length));
      POS6_ORDER.forEach(function (p) {
        var l = cand.filter(function (x) { return x.pos === p; }).sort(function (a, b) { return b.ovr - a.ovr || (a.nm < b.nm ? -1 : 1); }).slice(0, POOL6[p]);
        while (l.length < POOL6[p]) l.push({ nm: '', num: 0, cid: c.myClub, pos: p, ovr: avg - 2 });   // (liga corta: relleno)
        l.forEach(function (x) {
          var n = x.nm && !names[x.nm] ? x.nm : fresh(); names[n] = 1;
          var st = E._genSt(clamp(x.ovr, 20, 99), p, r);
          out.push({ id: 'p' + out.length, nm: n, num: x.num || 1 + Math.floor(r() * 20), cid: x.cid, pos: p, ovr: ovrOf(st), st: st, v: 0 });
        });
      });
    }
    return out.slice(0, POOL_MAX);
  }
  function topOvr(cur) { var t = 0; cur.pool.forEach(function (x) { if (x.ovr > t) t = x.ovr; }); return t || 50; }
  function ovrN(o, top) { return clamp((o - (top - 12)) / 16, 0, 1); }
  /** Votos fijos de los rivales (al abrir la votación). */
  function rivalVotes(c, cur) {
    var r = rng(c, 'as-vote', c.season | 0, String(lgKey(c))), top = topOvr(cur);
    cur.pool.forEach(function (x) {
      var oN = ovrN(x.ovr, top), cN = clubN(c, x.cid);
      var F = VOTE.rivF, N = VOTE.rivN, fN = clamp(F[0] + F[1] * r() + F[2] * cN, 0, 1), nN = clamp(N[0] + N[1] * oN + N[2] * (r() - 0.5), 0, 1);
      x.v = round1(100 * (VOTE.wF * fN + VOTE.wN * nN + VOTE.wC * cN + VOTE.wO * oN));
    });
  }
  function notaInfo(c) {
    var n = (c.notes || []).filter(function (x) { return x && typeof x.nota === 'number'; }), s = 0;
    n.forEach(function (x) { s += x.nota; });
    return { avg: n.length ? round1(s / n.length) : null, real: n.filter(function (x) { return !x.sim; }).length };
  }
  /** Media del corte de tu grupo (playa: todo el pool; pista: tu puesto): la del candidato rival que ocupa la última plaza. */
  function cutOvr(c, cur) {
    var six = hall(c), p = six ? role6(c) : '', n = six ? QUOTA6[p] || 2 : VOTE.cut;
    var l = cur.pool.filter(function (x) { return !six || x.pos === p; }).map(function (x) { return x.ovr; }).sort(function (a, b) { return b - a; });
    return l.length ? l[Math.min(n, l.length) - 1] : 50;
  }
  /** Cuántos puntos de media te faltan para el corte de tu grupo (0 si llegas). */
  function gapOf(c, cur) { return Math.max(0, cutOvr(c, cur) - cmpOvr(c)); }
  /** Tu media para compararte con las otras figuras: en la pista, con la ventaja con la que te mide tu entrenador (meEdge: tú lo juegas a
   *  mano; las medias de las plantillas van en otra escala). */
  function cmpOvr(c) { var E = K(c), o = E.playerOvr(c); if (hall(c) && E.meEdge) { try { o += +E.meEdge(c) || 0; } catch (e) { } } return o; }
  /** Fama que tiene una figura de tu liga: 20.000 seguidores en el nivel más alto, proporcional al nivel (LV_MULT). */
  function fameTop(c) { return VOTE.fameTop * LV_MULT[lvOf(c)] / LV_MULT[4]; }
  /** Tu voto (0-100) ahora mismo: fama (frente a la de una figura de tu liga), nota, tabla de tu club y tu media frente al mejor del
   *  pool; × (1 + 5 % por petición). Lejos de la media del corte de tu grupo, la afición no te ve entre los mejores: el voto baja. */
  function voteOf(c, cur) {
    var fame = c.life && isFinite(+c.life.fame) ? +c.life.fame : 0, ni = notaInfo(c);
    var fameN = clamp(Math.pow(Math.max(0, fame) / fameTop(c), VOTE.fameExp), 0, 1);
    var notaN = ni.avg == null ? 0 : clamp((ni.avg - VOTE.notaLo[hall(c) ? 1 : 0]) / 3, 0, 1) * Math.min(1, ni.real / 3);   // (las notas de la pista salen más altas)
    var cN = c.myClub >= 0 ? clubN(c, c.myClub) : 0.5, oN = ovrN(cmpOvr(c), topOvr(cur));
    var gk = clamp(1 - VOTE.gapK * Math.max(0, gapOf(c, cur) - VOTE.gap0), VOTE.gapMin, 1);
    return round1(100 * (VOTE.wF * fameN + VOTE.wN * notaN + VOTE.wC * cN + VOTE.wO * oN) * gk * (1 + VOTE.camp * (cur.camp | 0)));
  }
  function showVotes(c, v) { return Math.round(v * VOTE.show * LV_MULT[lvOf(c)] / 10) * 10; }
  /** Ranking de tu grupo (playa: todos; pista: tu puesto) con tu voto: {list: [{id, v}], rank, cut, V}. */
  function rankOf(c, cur) {
    var V = voteOf(c, cur), six = hall(c), p = six ? role6(c) : '';
    var list = cur.pool.filter(function (x) { return !six || x.pos === p; }).map(function (x) { return { id: x.id, v: x.v }; });
    list.push({ id: 'me', v: V });
    list.sort(function (a, b) { return b.v - a.v || (a.id === 'me' ? -1 : b.id === 'me' ? 1 : 0); });
    var rank = 0; list.forEach(function (x, i) { if (x.id === 'me') rank = i + 1; });
    return { list: list, rank: rank, cut: six ? QUOTA6[p] || 2 : VOTE.cut, V: V, pos: p };
  }
  function ent(c, cur, id) {
    if (id === 'me') return { id: 'me', nm: c.player.name, num: c.player.num | 0, ovr: K(c).playerOvr(c), st: c.player.st, pos: hall(c) ? role6(c) : c.player.roleKey, me: 1 };
    for (var i = 0; i < cur.pool.length; i++) if (cur.pool[i].id === id) return cur.pool[i];
    return null;
  }
  /** Concurso al que te invitarían sin plaza: {k, d}; d = tu golpe (en la pista, con la ventaja de tu media) − el del candidato en el
   *  puesto max(2, 27 % del pool) en ese golpe (playa, ~11 candidatos: el 2º; pista, 30: el 8º). Invitado si d > 0. */
  function invBest(c, cur) {
    var edge = cmpOvr(c) - K(c).playerOvr(c), out = { k: '', d: -999 };
    CT().ORDER.forEach(function (k) {
      var at = CT().CONTESTS[k].attr, vals = cur.pool.map(function (x) { return +x.st[at] || 0; }).sort(function (a, b) { return b - a; });
      var bar = vals.length ? vals[Math.min(vals.length, Math.max(2, Math.floor(vals.length * VOTE.invTop))) - 1] : 99, d = (+c.player.st[at] || 0) + edge - bar;
      if (d > out.d) out = { k: k, d: d };
    });
    return out;
  }
  /** Los técnicos miran lo que la afición no ve tanto: tu media llega a la del corte de tu grupo y tus notas en partidos jugados son
   *  buenas (notaLo + tecUp: 6,35 en la playa, 6,95 en la pista; al menos tecReal partidos). */
  function tecPick(c, cur, ni) { return ni.avg != null && ni.real >= VOTE.tecReal && ni.avg >= VOTE.notaLo[hall(c) ? 1 : 0] + VOTE.tecUp && gapOf(c, cur) <= VOTE.tecGap; }
  /** Elegidos y equipos (al cerrar la votación). */
  function selOf(c, cur) {
    var rk = rankOf(c, cur), six = hall(c), me = '', ni = notaInfo(c), teams = [[], []];
    var elected = {}, groups = {};
    if (!six) groups[''] = rk.list.slice(0, VOTE.cut).map(function (x) { return x.id; });
    else POS6_ORDER.forEach(function (p) {
      if (p === rk.pos) { groups[p] = rk.list.slice(0, QUOTA6[p]).map(function (x) { return x.id; }); return; }
      groups[p] = cur.pool.filter(function (x) { return x.pos === p; }).slice().sort(function (a, b) { return b.v - a.v; }).slice(0, QUOTA6[p]).map(function (x) { return x.id; });
    });
    var g = groups[six ? rk.pos : ''];
    if (g.indexOf('me') >= 0) me = 'vote';
    else if (tecPick(c, cur, ni) && g.length) { g[g.length - 1] = 'me'; me = 'tec'; }
    Object.keys(groups).forEach(function (p) {
      var l = groups[p];
      l.forEach(function (id, i) { elected[id] = 1; var t = l.length >= 4 ? (i === 0 || i === 3 ? 0 : 1) : (i % 2); teams[t].push(id); });
    });
    // sustituto si no juegas tú (no elegido no aplica; de baja o mirando): el siguiente de tu grupo que no ha entrado
    var sub = ''; rk.list.some(function (x) { if (x.id !== 'me' && !elected[x.id]) { sub = x.id; return true; } return false; });
    if (six) {   // equipos en el orden de la rotación (simRoles)
      var R = K(c).simRoles(), ord = function (t) {
        var byP = {}; t.forEach(function (id) { var e = ent(c, cur, id), p = e.pos; (byP[p] = byP[p] || []).push(id); });
        var out = R.map(function (p) { return (byP[p] || []).shift() || ''; });
        var left = []; Object.keys(byP).forEach(function (p) { left = left.concat(byP[p]); });
        return out.map(function (id) { return id || left.shift() || ''; });
      };
      teams = [ord(teams[0]), ord(teams[1])];
    } else teams = teams.map(function (t) { var i = t.indexOf('me'); if (i > 0) { t.splice(i, 1); t.unshift('me'); } return t; });
    var mine = teams[1].indexOf('me') >= 0 ? 1 : 0;
    var inv = { srv: !!me, rcv: !!me, atk: !!me };
    if (!me) {   // invitación a un concurso: el golpe en el que más te acercas a la marca de corte (o la pasas)
      var best = invBest(c, cur); if (best.k && best.d > 0) inv[best.k] = true;
    }
    var cutE = rk.list[rk.cut - 1];
    return { me: me, rank: rk.rank, cut: rk.cut, votes: showVotes(c, rk.V), cutVotes: cutE ? showVotes(c, cutE.v) : 0, teams: teams, mine: mine, inv: inv, sub: sub, pos: rk.pos };
  }
  /** Las 5 (o 6, si no participas) marcas rivales de un concurso, fijas: los del pool con más de ese atributo. */
  function rivalsOf(c, cur, k, mine) {
    var D = CT().CONTESTS[k], r = rng(c, 'as-ct', c.season | 0, k);
    var l = cur.pool.slice().sort(function (a, b) { return (+b.st[D.attr] || 0) - (+a.st[D.attr] || 0) || (a.id < b.id ? -1 : 1); }).slice(0, mine ? 5 : 6);
    return l.map(function (x) { var a = +x.st[D.attr] || 0; return { nm: x.nm, cid: x.cid, s: CT().rivalScore(k, a, r), a: Math.round(a) }; });
  }

  // ------------------------------------------------------------------ pagos
  function pay(c, cur, fame, money) {
    fame = Math.max(0, Math.round(fame || 0)); money = Math.max(0, Math.round(money || 0));
    var L = LF();
    if (fame && L && L.addFame) { try { fame = L.addFame(c, fame) | 0; } catch (e) { fame = 0; } } else fame = L && L.addFame ? fame : 0;
    if (money) { c.money = Math.max(0, Math.round((+c.money || 0) + money)); if (obj(c.life) && isFinite(+c.life.earned)) c.life.earned += money; }
    if (cur) { cur.fame += fame; cur.money += money; }
    return { fame: fame, money: money };
  }
  function lookGrant(c, key) {
    var a = ensure(c), id = LOOKS[key]; if (a.got[key]) return '';
    a.got[key] = 1;
    var X = VB.Look, nw = false; if (!X || !X.grant) return '';
    try { nw = X.owned && X.owned(id) ? false : X.grant(id, 'carrera') === true; } catch (e) { nw = false; }
    if (!nw) return '';
    var n = LOOK_N[id] || id; try { if (X.name) n = X.name(id) || n; } catch (e) { }
    return String(n);
  }
  function prizeTxt(f, m, look) {
    var p = []; if (m > 0) p.push('+' + eur(m)); if (f > 0) p.push('+' + num(f) + ' seguidores');
    return p.join(' y ') + (look ? (p.length ? '. ' : '') + 'Nuevo en tu vestuario: ' + look : '');
  }

  // ------------------------------------------------------------------ apertura, resultado y cierre
  function open(c, cal) {
    var cur = { s: c.season | 0, lg: lgKey(c), lgName: lgName(c), st: 'vote', w0: c.week | 0, wk: cal.mid, camp: 0, cw: -1, dw: -1, pool: poolOf(c),
      sel: null, m: null, srv: null, rcv: null, atk: null, fame: 0, money: 0 };
    rivalVotes(c, cur);
    return cur;
  }
  function noteOpen(c, cur) {
    var rk = rankOf(c, cur), six = hall(c);
    msg(c, 'Votación de las Estrellas', 'La afición elige a lo mejor ' + deL(cur.lgName) + '. Ahora vas ' + ordn(rk.rank) + (six ? ' en tu puesto' : '') +
      ' y entran ' + rk.cut + '. El fin de semana de las Estrellas es tras la jornada ' + cur.wk + '. Míralo en Partido.');
    wall(c, media(c), 'Ya hay votación para las Estrellas ' + deL(cur.lgName) + '. ¿Quién se lleva el concurso de saques?');
  }
  function newPart(k) { return k === 'm' ? { st: 'pend', w: -1, sc: [0, 0], nota: null, mvp: '', mvpMe: false, me: false, watch: false, fame: 0, money: 0, look: '' } : { st: 'pend', n: 0, at: 0, best: 0, rank: 0, riv: [], mine: false, fame: 0, money: 0, look: '' }; }
  function result(c, cur) {
    var s = cur.sel = selOf(c, cur), L = lvOf(c), out = blockedNow(c);
    PARTS.forEach(function (k) { cur[k] = newPart(k); });
    ['srv', 'rcv', 'atk'].forEach(function (k) { cur[k].mine = !!s.inv[k]; cur[k].riv = rivalsOf(c, cur, k, s.inv[k]); });
    cur.st = 'event'; cur.wk = c.week | 0;
    var team = s.me ? TEAMS[s.mine].name : '', f = 0;
    if (s.me) f = pay(c, cur, FAME[s.me] * LV_MULT[L], 0).fame;
    var subE = s.sub ? ent(c, cur, s.sub) : null;
    var inv = ['srv', 'rcv', 'atk'].filter(function (k) { return s.inv[k]; }), invTxt = inv.map(function (k) { return 'de ' + CT().CONTESTS[k].short.toLowerCase(); });
    if (s.me === 'vote') {
      msg(c, '¡Eres Estrella!', ordn(s.rank) + ' en la votación, con ' + num(s.votes) + ' votos. Juegas el Partido de las Estrellas con el ' + team + ' y estás en los tres concursos.' +
        (f ? ' +' + num(f) + ' seguidores.' : '') + (out ? ' Pero estás de baja: si no te recuperas, te sustituye ' + (subE ? subE.nm : 'otro') + '.' : ''));
      wall(c, media(c), c.player.name + ', Estrella de la afición: ' + num(s.votes) + ' votos.');
    } else if (s.me === 'tec') {
      msg(c, 'Te eligen los técnicos', 'La afición te deja ' + ordn(s.rank) + ', pero tus notas pesan. Juegas con el ' + team + ' y estás en los tres concursos.' + (f ? ' +' + num(f) + ' seguidores.' : ''));
      wall(c, media(c), 'Los técnicos rescatan a ' + c.player.name + ' para el Partido de las Estrellas.');
    } else if (inv.length) {
      msg(c, 'Esta vez no entras', 'Quedas ' + ordn(s.rank) + ' en la votación. Eso sí: te invitan al concurso ' + invTxt[0] + '. Es de lo mejor de la liga.');
    } else msg(c, 'Esta vez no entras', 'Quedas ' + ordn(s.rank) + ' en la votación. Puedes seguir el fin de semana desde Partido.');
  }
  /** Cierra el fin de semana: simula lo pendiente, lo empezado y no acabado cuenta como abandonado, pasa al historial y avisa. */
  function close(c, cur) {
    if (cur.st === 'vote') { ensure(c).cur = null; return; }
    if (cur.st !== 'event') return;
    if (cur.m.st === 'pend') simMatch(c, cur, canPlay(c, cur), 'sim');
    else if (cur.m.st === 'live') simMatch(c, cur, false, cur.m.watch || !cur.sel.me ? 'sim' : 'gone');
    ['srv', 'rcv', 'atk'].forEach(function (k) {
      var p = cur[k]; p.at = 0;
      if (p.st === 'pend') simContest(c, cur, k);
      else if (p.st === 'live') { if (p.best > 0) { p.st = 'play'; } else { p.st = 'gone'; p.rank = CT().N; } }
    });
    cur.st = 'done'; cur.dw = c.week | 0;
    var a = ensure(c); a.log.push(logOf(c, cur)); if (a.log.length > LOG_MAX) a.log = a.log.slice(-LOG_MAX);
    var bits = ['srv', 'rcv', 'atk'].map(function (k) { var w = winnerOf(cur, k); return CT().CONTESTS[k].short + ': ' + (w.me ? 'tú' : w.nm); });
    var m = cur.m, mt = m.w >= 0 ? 'Gana el ' + TEAMS[m.w].name + ' (' + Math.max(m.sc[0], m.sc[1]) + '-' + Math.min(m.sc[0], m.sc[1]) + '). MVP: ' + (m.mvpMe ? 'tú' : m.mvp) + '. ' : '';
    msg(c, 'Fin de semana de las Estrellas', mt + bits.join('. ') + '.');
  }
  function winnerOf(cur, k) { return listOf(cur, k)[0] || { nm: '', s: 0 }; }
  /** Ranking del concurso k (tú dentro si participas y ya tienes marca; abandonado con 0, último). */
  function listOf(cur, k) {
    var p = cur[k], inMe = p.mine && (p.st === 'play' || p.st === 'sim' || p.st === 'gone' || p.best > 0), l = CT().rank(inMe ? p.best : null, p.riv);
    if (inMe && p.st === 'gone' && !p.best) { var i = CT().placeOf(l) - 1; if (i >= 0) l.push(l.splice(i, 1)[0]); }
    return l;
  }
  function logOf(c, cur) {
    var s = cur.sel, m = cur.m, ct = {};
    ['srv', 'rcv', 'atk'].forEach(function (k) {
      var p = cur[k], l = listOf(cur, k), w = l[0] || { nm: '', s: 0 };
      ct[k] = { rank: p.mine ? CT().placeOf(l) : 0, s: p.mine ? p.best : 0, how: p.mine ? p.st : 'no', win: w.me ? '' : w.nm, ws: w.s };
    });
    return { s: cur.s, name: cur.lgName, sel: s.me, rank: s.rank, fame: Math.round(cur.fame), money: Math.round(cur.money),
      m: { w: m.w, sc: m.sc.slice(), mine: s.mine, me: m.me, nota: m.nota, mvp: m.mvp, mvpMe: m.mvpMe, how: s.me ? m.st : (m.st === 'watch' ? 'watch' : 'no') }, ct: ct };
  }

  // ------------------------------------------------------------------ partido: simular y resultado
  function canPlay(c, cur) { return !!(cur.sel && cur.sel.me) && !blockedNow(c); }
  function teamIds(cur, withMe) {
    var s = cur.sel; return s.teams.map(function (t) { return t.map(function (id) { return id === 'me' && !withMe ? s.sub || id : id; }); });
  }
  function teamOvr(c, cur, ids) { var s = 0, n = 0; ids.forEach(function (id) { var e = ent(c, cur, id); if (e) { s += e.ovr; n++; } }); return n ? s / n : 50; }
  /** MVP por media: el mejor del equipo ganador (sin ti salvo que juegues). */
  function mvpByOvr(c, cur, ids, noMe) {
    var b = null; ids.forEach(function (id) { if (noMe && id === 'me') return; var e = ent(c, cur, id); if (e && (!b || e.ovr > b.ovr)) b = e; }); return b;
  }
  function payMatch(c, cur, real) {
    var m = cur.m, L = lvOf(c), f = 0, mo = 0, look = '';
    if (!m.me) return;
    if (m.w === cur.sel.mine) f += FAME.win * LV_MULT[L];
    if (m.mvpMe) { f += FAME.mvp * LV_MULT[L]; mo += Math.round(MVP_MONEY * SALARY[L] / 10) * 10; if (real) look = lookGrant(c, 'mvp'); }
    var p = pay(c, cur, f, mo); m.fame = p.fame; m.money = p.money; m.look = look;
  }
  /** Simula el partido (how 'sim' | 'gone'): con withMe, tú juegas (nota y premios); si no, el sustituto. */
  function simMatch(c, cur, withMe, how) {
    var T = teamIds(cur, withMe), r = rng(c, 'as-msim', c.season | 0, String(cur.lg)), o0 = teamOvr(c, cur, T[0]), o1 = teamOvr(c, cur, T[1]);
    var p0 = 1 / (1 + Math.exp(-(o0 - o1) / 4)), w = r() < p0 ? 0 : 1, lo = 12 + Math.floor(r() * 8), m = cur.m;
    m.w = w; m.sc = w === 0 ? [PTS, lo] : [lo, PTS]; m.me = !!withMe; m.st = how || 'sim';
    var mine = cur.sel.mine, myO = K(c).playerOvr(c), avg = (o0 + o1) / 2;
    m.nota = withMe ? round1(clamp(6.0 + 0.08 * (myO - avg) + (r() - 0.5), 3, 10)) : null;
    var b = mvpByOvr(c, cur, T[w], false), rm = r();
    m.mvpMe = !!(withMe && w === mine && b && b.id === 'me' && rm < 0.35);
    if (!m.mvpMe) { var b2 = mvpByOvr(c, cur, T[w], true); m.mvp = b2 ? b2.nm : ''; } else m.mvp = c.player.name;
    payMatch(c, cur, false);
  }
  function simContest(c, cur, k) {
    var p = cur[k], D = CT().CONTESTS[k], mine = p.mine && !blockedNow(c);
    if (!mine) { p.mine = false; p.st = 'sim'; p.rank = 0; return; }
    var s = CT().simMine(k, +c.player.st[D.attr] || 0, rng(c, 'as-cts', c.season | 0, k));
    p.best = s; p.st = 'sim'; p.n = Math.max(p.n, 1);
    payContest(c, cur, k, false);
  }
  /** Paga el puesto del concurso k (solo la diferencia con lo ya pagado) y, jugando y ganando, la prenda la primera vez. */
  function payContest(c, cur, k, real) {
    var p = cur[k], l = listOf(cur, k), rk = CT().placeOf(l), z = CT().prize(rk, lvOf(c));
    p.rank = rk;
    var df = Math.max(0, z.fame - p.fame), dm = Math.max(0, z.money - p.money), got = pay(c, cur, df, dm);
    p.fame += df; p.money += dm;
    var look = real && rk === 1 ? lookGrant(c, k) : '';
    if (look) p.look = look;
    return { list: l, rank: rk, fame: got.fame, money: got.money, look: look };
  }
  function simPart(c, k) {
    var cur = live(c); if (!cur || PARTS.indexOf(k) < 0 || cur[k].st !== 'pend') return false;
    if (k === 'm') simMatch(c, cur, canPlay(c, cur), 'sim'); else simContest(c, cur, k);
    if (k !== 'm') noteContest(c, cur, k, cur[k].best, false);
    return true;
  }
  function simAll(c) { var n = 0; PARTS.forEach(function (k) { if (simPart(c, k)) n++; }); return n; }
  function noteContest(c, cur, k, score, real) {
    var p = cur[k], D = CT().CONTESTS[k]; if (!p.mine) return;
    var l = listOf(cur, k), w = l[0], pz = prizeTxt(p.fame, p.money, p.look);
    if (p.rank === 1) msg(c, '¡Ganas el ' + D.name.toLowerCase() + '!', p.best + ' puntos y nadie te alcanza.' + (pz ? ' ' + pz + '.' : ''));
    else msg(c, D.name + ': ' + ordn(p.rank), p.best + ' puntos' + (real ? '' : ' (simulado)') + '. Ganó ' + w.nm + ' con ' + w.s + '.' + (pz ? ' ' + pz + '.' : ''));
  }

  // ------------------------------------------------------------------ edición en curso
  function live(c) { var a = ensure(c), cur = a && a.cur; return cur && cur.st === 'event' && cur.s === (c.season | 0) && c.phase === 'league' ? cur : null; }
  function curOf(c) { var a = ensure(c); return a && a.cur && a.cur.s === (c.season | 0) ? a.cur : null; }
  function canCamp(c, cur) { return !!(cur && cur.st === 'vote' && cur.camp < VOTE.campMax && cur.cw !== (c.week | 0)); }
  /** «Pedir el voto» (elección del jugador): +5 % de votos, entrenador −1. Guarda. */
  function camp(c) {
    c = c || (VB.Career && VB.Career.get()); var cur = c && curOf(c);
    if (!canCamp(c, cur)) return false;
    cur.camp++; cur.cw = c.week | 0;
    var L = LF(); if (L && L.applyEff) { try { L.applyEff(c, { coach: -1 }); } catch (e) { c.coach = clamp((c.coach | 0) - 1, 0, 100); } } else c.coach = clamp((c.coach | 0) - 1, 0, 100);
    wall(c, 'me', 'Si os sobra un minuto, votadme para lo de las Estrellas.');
    save(c);
    return true;
  }

  // ------------------------------------------------------------------ gancho del núcleo
  function hook(c, kind, a) {
    if (!A.enabled || !obj(c) || !c.player) return;
    if (kind === 'match') { onWeek(c); return; }
    if (kind === 'season' || kind === 'newSeason') { var x = ensure(c), cur = x.cur; if (cur && cur.st !== 'done') { close(c, cur); if (x.cur === cur && cur.st === 'vote') x.cur = null; } return; }
    if (kind === 'join') {
      var y = ensure(c), cv = y.cur;
      if (cv && cv.st === 'vote' && cv.s === (c.season | 0) && c.phase === 'league') { y.cur = null; y.skip = c.season | 0; msg(c, 'Fuera de la votación', 'Con el cambio de club te quedas fuera de la votación de las Estrellas.'); }
    }
  }
  function onWeek(c) {
    var a = ensure(c), cur = a.cur;
    if (cur && cur.st === 'event' && ((c.week | 0) > cur.wk || c.phase !== 'league' || cur.s !== (c.season | 0))) close(c, cur);
    if (cur && cur.st === 'vote' && (c.phase !== 'league' || cur.s !== (c.season | 0))) { a.cur = null; cur = null; }
    if (c.phase !== 'league' || !(c.myClub >= 0) || prologueOn(c)) return;
    var cal = calOf(c); if (!cal) return;
    cur = a.cur;
    if ((!cur || cur.s !== (c.season | 0)) && a.skip !== (c.season | 0) && (c.week | 0) >= cal.w0 && (c.week | 0) < cal.mid) { cur = a.cur = open(c, cal); noteOpen(c, cur); }
    if (cur && cur.s === (c.season | 0) && cur.st === 'vote' && (c.week | 0) >= cur.wk) result(c, cur);
  }

  // ------------------------------------------------------------------ partido de las Estrellas: montaje y cierre (main.js)
  function engOf(mode) { var C = VB.Career; return C ? (mode === 'hall' ? C.hall : mode === 'beach' ? C.beach : null) : null; }
  function carOf(mode) { var E = engOf(mode) || (VB.Career && VB.Career.mode && engOf(VB.Career.mode())); try { return E ? E.get() : null; } catch (e) { return null; } }
  function freeNum(used, n) { n = n | 0; if (n >= 1 && !used[n] && n !== 13) { used[n] = 1; return n; } for (var i = 1; i < 99; i++) if (!used[i] && i !== 13) { used[i] = 1; return i; } return 99; }
  /** Opciones del partido (como trialSetup): auto = «Mirar» (la CPU juega sola y tú no estás). Reentrante (Reiniciar). */
  function setup(arg, auto) {
    var c = carOf(), cur = c && live(c); if (!cur) return null;
    var m = cur.m; if (m.st !== 'pend' && m.st !== 'live') return null;
    auto = !!auto;
    if (!auto && !canPlay(c, cur)) return null;
    if (auto && canPlay(c, cur) && !(m.st === 'live' && m.watch)) return null;   // (elegido y sano: se juega o se simula; mirar es para quien no juega)
    var E = K(c), six = hall(c), withMe = !auto, T = teamIds(cur, withMe), mine = cur.sel.mine, rv = 1 - mine;
    var venue = six ? 'hall' : 'beach', clubs = lgClubs(c), host = null;
    try { var tb = E.table(c, six ? myClub(c).lid : myClub(c).lvl); host = E._club ? E._club(c, tb[0].id) : E.club(c, tb[0].id); } catch (e) { host = null; }
    var strong = clubs.slice().sort(function (a, b) { return clubOvr(c, b) - clubOvr(c, a); })[0], ai = { diff: 'normal', soft: false };
    try { ai = E.rivalAI(c, strong) || ai; } catch (e) { }
    var ref = null;
    try { var Lg = six ? E.league(myClub(c).lid, c) : E.league(myClub(c).lvl); ref = copy(E.REF[six ? E.ref(Lg ? Lg.strength : 60) : Lg.ref]); } catch (e) { ref = copy(E.REF.mid); }
    ref.chal = 0;
    var bd = null; try { bd = VB.Badges && VB.Badges.forPlayer ? VB.Badges.forPlayer(c.player) : null; } catch (e) { bd = null; } if (bd && !Object.keys(bd).length) bd = null;
    var sides = [T[mine], T[rv]], attrs = [], nums = [], names = [], ctrlIdx = 0, used;
    sides.forEach(function (ids, t) {
      used = {}; if (t === 0 && withMe) used[c.player.num | 0] = 1;
      var at = [], nu = [], na = [];
      ids.forEach(function (id, j) {
        var e = ent(c, cur, id) || cur.pool[0];
        if (id === 'me') { ctrlIdx = j; at.push(copy(c.player.st)); nu.push(c.player.num | 0); na.push(c.player.name); return; }
        at.push(copy(e.st)); nu.push(freeNum(used, e.num)); na.push(e.nm);
      });
      attrs.push(at); nums.push(nu); names.push(na);
    });
    var role = six ? role6(c) : c.player.roleKey, mateI = six ? -1 : (ctrlIdx === 0 ? 1 : 0);
    var cs = { allstar: true, ext: ID, extArg: 'm', mode: venue, season: c.season, phase: c.phase, week: c.week, round: 0, label: 'Partido de las Estrellas',
      me: TEAMS[mine].k, rival: TEAMS[rv].k, meName: TEAMS[mine].name, rivalName: TEAMS[rv].name, venue: venue, clubName: TEAMS[mine].name,
      player: c.player.name, num: c.player.num, pos: role, posName: posName(c, role), mate: six ? '' : names[0][mateI] || '', mateNum: six ? 0 : nums[0][mateI] | 0,
      meOn: withMe, status: 'start', sets: 1, points: PTS, noAmb: true,
      pause: auto ? { restart: 'Reiniciar partido', quit: 'Salir: se simula', warn: '' } : { restart: 'Reiniciar partido', quit: 'Salir: se simula sin ti', warn: 'Si sales, el partido se simula sin ti' } };
    m.st = 'live'; m.watch = auto; save(c);
    var out = { attrs: attrs, nums: nums, badges: withMe && bd ? [attrs[0].map(function (x, j) { return j === ctrlIdx ? bd : null; }), null] : null, points: PTS, sets: 1,
      difficulty: ai.diff || 'normal', rookie: !!ai.soft, ref: ref, venue: venue, ctrlIdx: ctrlIdx, ctrl: 'one',
      kit: copy(KITS[mine]), rivalKit: copy(KITS[rv]), career: cs,
      fixture: host ? { home: host, away: host, kind: 'league', week: 99, label: 'Partido de las Estrellas' } : null };
    if (six) { out.format = '6v6'; out.ctrlRole = role; out.meSlot = withMe ? ctrlIdx : -1; out.meBench = -1; out.names = names; }
    else out.names = names;
    if (withMe && VB.Career && VB.Career.sigOf) { try { var sg = VB.Career.sigOf(c, venue); if (sg) out.serveSig = sg; } catch (e) { } }
    return out;
  }
  function liveNota(c, res, g) {
    var C = VB.Career, M = null; try { M = C && C.beach && C.beach._M ? C.beach._M() : null; } catch (e) { M = null; }
    if (!M || (g && M.g !== g)) return null;
    var sets = [res.sets[0] | 0, res.sets[1] | 0], sc = (res.setScores || []).map(function (x) { return [x[0] | 0, x[1] | 0]; });
    var rt = null; try { rt = M.rt && VB.Rating && VB.Rating.close ? VB.Rating.close(M.rt, { sets: sets, setScores: sc }) : null; } catch (e) { rt = null; }
    if (rt && isFinite(+rt.nota)) return round1(+rt.nota);
    var me = M.p && M.p[0] || {}, ral = M.rallies || sc.reduce(function (s, x) { return s + x[0] + x[1]; }, 0);
    try { var E = K(c); return E.rating(me, { win: !!res.win, sets: sets }, ral, hall(c) ? (E.RATE6 && E.RATE6[role6(c)]) || 3 : undefined); } catch (e) { return 6; }
  }
  /** gameOver del partido: res = {sets, setScores, win} (win = gana tu equipo, el de la izquierda); g.autopilot = «Mirar». */
  function done(res, g) {
    var mode = g && g.career && g.career.mode, c = carOf(mode), cur = c && live(c);
    if (!cur || cur.m.st !== 'live') { try { VB.Career.abortMatch(); } catch (e) { } return { title: 'Estrellas', kicker: ['Partido de las Estrellas'], html: '<p class="as-p">El fin de semana de las Estrellas ya se ha cerrado.</p>' }; }
    var m = cur.m, mine = cur.sel.mine, watch = !!(g && g.autopilot) || m.watch, sc0 = (res.setScores && res.setScores[0]) || [0, 0];
    var nota = watch ? null : liveNota(c, res, g);
    try { VB.Career.abortMatch(); } catch (e) { }
    m.w = res.win ? mine : 1 - mine;
    var a0 = sc0[0] | 0, a1 = sc0[1] | 0; m.sc = mine === 0 ? [a0, a1] : [a1, a0];
    m.me = !watch; m.nota = nota; m.st = watch ? 'watch' : 'play';
    var T = teamIds(cur, !watch);
    m.mvpMe = !watch && nota != null && ((res.win && nota >= 8.0) || nota >= 8.6);
    if (!m.mvpMe) { var b = mvpByOvr(c, cur, T[m.w], true); m.mvp = b ? b.nm : ''; } else m.mvp = c.player.name;
    if (!watch) { payMatch(c, cur, true); c.fatigue = clamp((c.fatigue | 0) + FATIGUE, 0, 100); }
    save(c); cssIn();
    return matchSheet(c, cur);
  }
  function matchSheet(c, cur) {
    var m = cur.m, mine = cur.sel.mine, won = m.me && m.w === mine;
    var lines = '<p class="as-sc"><b class="as-t0">' + esc(TEAMS[0].name) + '</b> <span class="as-n">' + m.sc[0] + '-' + m.sc[1] + '</span> <b class="as-t1">' + esc(TEAMS[1].name) + '</b></p>';
    if (m.nota != null) lines += '<p class="as-p">Tu nota: <b>' + dec(m.nota) + '</b></p>';
    lines += '<p class="as-p">MVP: <b>' + esc(m.mvpMe ? 'tú' : m.mvp) + '</b></p>';
    var pz = prizeTxt(m.fame, m.money, m.look); if (pz) lines += '<p class="as-p as-gold">' + esc(pz) + '</p>';
    if (!m.me) lines += '<p class="as-p as-mut">Exhibición: sin nota ni premios para ti.</p>';
    return { title: m.w === mine && m.me ? '¡Gana ' + TEAMS[m.w].short + '!' : 'Gana ' + TEAMS[m.w].short, kicker: ['Partido de las Estrellas'], back: 'Volver a la Carrera', html: lines, win: won, sc: m.sc.slice(), nota: m.nota, mvp: m.mvpMe ? 'me' : m.mvp };
  }
  /** Salir a mitad: se simula sin ti (o, mirando, se simula y ya). */
  function quit(cs, why, g) {
    if (why === 'restart') return true;
    var c = carOf(cs && cs.mode), cur = c && live(c); if (!cur || cur.m.st !== 'live') return false;
    try { VB.Career.abortMatch(); } catch (e) { }
    simMatch(c, cur, false, cur.m.watch || !cur.sel.me ? 'sim' : 'gone'); save(c);
    return true;
  }

  // ------------------------------------------------------------------ concursos: montaje y cierre (main.js / ui.js)
  function contestCan(c, cur, k) {
    if (!cur || !cur[k] || k === 'm') return '';
    var p = cur[k];
    if (!p.mine) return 'inv';
    if (blockedNow(c)) return 'baja';
    if (p.st !== 'pend' && p.st !== 'live' && p.st !== 'play') return 'st';
    if (p.n >= CT().TRIES) return 'n';
    return 'ok';
  }
  var PAUSE_D = { restart: 'Reiniciar (gasta el intento)', quit: 'Volver a la Carrera', warn: 'Si reinicias o sales, el intento cuenta 0' };
  function drillSetup(arg) {
    var c = carOf(), cur = c && live(c), k = String(arg || '');
    if (!cur || !CT() || !CT().CONTESTS[k]) return null;
    var p = cur[k]; if (p.at) p.at = 0;   // (intento anterior sin terminar: ya contado)
    if (contestCan(c, cur, k) !== 'ok') return null;
    p.n++; p.at = p.n; p.st = 'live';
    var D = CT().CONTESTS[k], top = cur.pool.slice().sort(function (a, b) { return b.ovr - a.ovr; })[0], E = K(c);
    var mate = E._genSt(clamp(top ? top.ovr : 60, 20, 99), k === 'atk' ? 'S' : 'OH', rng(c, 'as-dmate', c.season | 0, k));
    var bd = null; try { bd = VB.Badges && VB.Badges.forPlayer ? VB.Badges.forPlayer(c.player) : null; } catch (e) { bd = null; } if (bd && !Object.keys(bd).length) bd = null;
    save(c);
    return { id: D.drill, cc: k, label: D.short, n: p.n, max: CT().TRIES, mode: hall(c) ? 'hall' : 'beach', attrs: [[copy(c.player.st), mate], null], badges: bd ? [[bd, null], null] : null,
      kit: copy(KITS[0]), scrim: copy(SCRIM), venue: hall(c) ? 'hall' : 'beach', player: c.player.name, club: 'Estrellas', pause: copy(PAUSE_D),
      target: p.riv.length ? Math.max.apply(null, p.riv.map(function (x) { return x.s; })) : 0, riv: copy(p.riv) };
  }
  function nextContest(c, cur, after) {
    var o = CT().ORDER, i0 = o.indexOf(after);
    for (var j = 1; j <= o.length; j++) { var k = o[(i0 + j) % o.length]; if (k !== after && contestCan(c, cur, k) === 'ok' && cur[k].n === 0) return k; }
    return '';
  }
  function placeHTML(rk) { return '<span class="as-place' + (rk === 1 ? ' as-p1' : '') + '"><b>' + esc(ordn(rk)) + '</b><small>PUESTO</small></span>'; }
  function rankHTML(list, n) {
    return '<ol class="as-rank">' + list.slice(0, n || 6).map(function (x, i) { return '<li' + (x.me ? ' class="me"' : '') + '><span>' + esc(ordn(i + 1)) + ' ' + esc(x.me ? 'Tú' : x.nm) + '</span><b>' + x.s + '</b></li>'; }).join('') + '</ol>';
  }
  function drillRes(k, total, best, list, rk, prize, left, nx) {
    var D = CT().CONTESTS[k], pz = prizeTxt(prize.fame, prize.money, '');
    var html = rankHTML(list) + (best > total ? '<p class="as-p">Cuenta tu mejor intento: <b>' + best + '</b></p>' : '') +
      (pz ? '<p class="as-p as-gold">' + esc(pz) + '</p>' : '') + (prize.look ? '<p class="as-p as-gold">Nuevo en tu vestuario: ' + esc(prize.look) + '</p>' : '');
    return { ok: true, cc: k, score: total, best: best, rank: rk, list: list, prize: prize, left: left, next: nx ? { label: 'Siguiente: ' + CT().CONTESTS[nx].short, arg: nx } : null,
      again: left > 0 ? { label: '2º intento', arg: k } : null, kick: ['Estrellas', D.name], meds: placeHTML(rk), html: html, say: 'puesto ' + ordn(rk) + ' en el ' + D.name.toLowerCase() };
  }
  function drillDone(arg, total, reps, g) {
    var mode = g && g.careerExtDrill && g.careerExtDrill.mode, c = carOf(mode), cur = c && live(c), k = String(arg || '');
    cssIn();
    if (!cur || !CT().CONTESTS[k] || !cur[k].at) return { kick: ['Estrellas', 'Concurso'], meds: '', html: '<p class="as-p">El fin de semana de las Estrellas ya se ha cerrado.</p>', again: null, next: null, say: '' };
    var p = cur[k]; total = clamp(total | 0, 0, CT().TOP);
    var rk0 = p.rank, best0 = p.best; p.at = 0; p.best = Math.max(p.best, total); p.st = 'play';
    var z = payContest(c, cur, k, true), left = Math.max(0, CT().TRIES - p.n);
    if (p.best > best0 || !rk0) noteContest(c, cur, k, total, true);
    save(c);
    return drillRes(k, total, p.best, z.list, z.rank, { fame: p.fame, money: p.money, look: z.look }, left, nextContest(c, cur, k));
  }
  function drillQuit(arg, why, g) {
    var mode = g && g.careerExtDrill && g.careerExtDrill.mode, c = carOf(mode), cur = c && live(c), k = String(arg || '');
    if (!cur || !CT().CONTESTS[k]) return false;
    var p = cur[k];
    if (p.at) { p.at = 0; p.st = p.best > 0 ? 'play' : p.n >= CT().TRIES ? 'gone' : 'live'; if (p.st === 'gone') p.rank = CT().N; save(c); }
    return why === 'restart' ? contestCan(c, cur, k) === 'ok' : true;
  }

  // ------------------------------------------------------------------ modelo de vista (puro)
  function partMeta(c, cur, k) {
    if (k === 'm') return 'Set a ' + PTS;
    var p = cur[k], w = p.riv.slice().sort(function (a, b) { return b.s - a.s; })[0];
    return (w ? 'Marca a batir: ' + w.s + ' de ' + w.nm : '') + (p.mine ? ' | ' + (CT().TRIES - p.n > 0 ? (CT().TRIES - p.n === 1 && p.n ? '1 intento' : CT().TRIES - p.n + ' intentos') : 'sin intentos') : '');
  }
  function state(c) {
    if (!A.enabled || !obj(c) || !c.player || !CT()) return null;
    var cur = curOf(c); if (!cur) return null;
    var out = { st: cur.st, name: cur.lgName, wk: cur.wk, w0: cur.w0, six: hall(c), week: c.week | 0 };
    if (cur.st === 'vote') {
      var rk = rankOf(c, cur), cutE = rk.list[rk.cut - 1], topV = rk.list[0].v;
      out.vote = { rank: rk.rank, cut: rk.cut, V: rk.V, votes: showVotes(c, rk.V), cutV: cutE ? cutE.v : 0, topV: topV, camp: cur.camp, campMax: VOTE.campMax, canCamp: canCamp(c, cur),
        asked: cur.cw === (c.week | 0), pos: rk.pos };
      return out;
    }
    if (!cur.sel) return null;
    var s = cur.sel, out2 = blockedNow(c);
    out.sel = { me: s.me, rank: s.rank, team: s.me ? TEAMS[s.mine].name : '', mine: s.mine, votes: s.votes };
    out.out = !!out2; out.sub = s.sub && ent(c, cur, s.sub) ? ent(c, cur, s.sub).nm : '';
    out.parts = PARTS.map(function (k) {
      var p = cur[k], D = k === 'm' ? null : CT().CONTESTS[k], o = { k: k, name: k === 'm' ? 'Partido de las Estrellas' : D.short, st: p.st, meta: partMeta(c, cur, k), mine: k === 'm' ? !!s.me : p.mine };
      if (k === 'm') {
        var pend = p.st === 'pend' || p.st === 'live', cp = canPlay(c, cur);
        o.can = { play: pend && cp, watch: pend && !cp, sim: p.st === 'pend' };
        if (p.w >= 0) o.res = { w: p.w, sc: p.sc.slice(), mvp: p.mvpMe ? 'tú' : p.mvp, nota: p.nota, me: p.me };
      } else {
        var cc = contestCan(c, cur, k), list = listOf(cur, k), done = p.st === 'play' || p.st === 'sim' || p.st === 'gone';
        o.can = { play: cc === 'ok', sim: p.st === 'pend', again: cc === 'ok' && p.n > 0 };
        o.n = p.n; o.best = p.best;
        if (done) o.res = { list: list, rank: p.mine ? CT().placeOf(list) : 0, best: p.best };
      }
      return o;
    });
    out.left = out.parts.filter(function (x) { return x.st === 'pend' || x.st === 'live'; }).length;
    if (cur.st === 'done') { out.fresh = cur.dw === (c.week | 0); }
    return out;
  }

  // ------------------------------------------------------------------ interfaz (VB.CareerUIExt)
  function sep(H, a, k) { return H && H.sp ? H.sp(a, k || 'v') : a.join(' | '); }
  function btn(act, label, cls, sub, off) {
    return '<button type="button" class="sp-btn sp-sm ' + (cls || 'sp-cream') + (off ? ' sp-off' : '') + '" data-act="' + act + '"' + (off ? ' disabled aria-disabled="true"' : '') +
      '><span class="sp-l"><span class="sp-t">' + esc(label) + '</span>' + (sub ? '<small class="sp-s">' + esc(sub) + '</small>' : '') + '</span></button>';
  }
  function tagOf(o) {
    if (o.k === 'm') {
      if (o.res) return o.res.me ? (o.res.w === o.mineT ? 'Ganado ' : 'Perdido ') + Math.max(o.res.sc[0], o.res.sc[1]) + '-' + Math.min(o.res.sc[0], o.res.sc[1]) : 'Gana ' + TEAMS[o.res.w].short;
      return o.st === 'live' ? 'A medias' : 'Pendiente';
    }
    if (o.res) return o.mine ? (o.res.rank ? ordn(o.res.rank) + ' con ' + o.res.best : 'Abandono') + (o.st === 'sim' ? ' (sim.)' : '') : 'Gana ' + first(o.res.list[0] ? o.res.list[0].nm : '');
    if (!o.mine) return 'Sin invitación';
    return o.n ? ordn(o.n) + ' intento hecho' : 'Pendiente';
  }
  function compact(list, H) {
    return sep(H, list.slice(0, 3).map(function (x, i) { return esc(ordn(i + 1)) + ' ' + (x.me ? '<b>Tú</b>' : esc(x.nm)) + ' ' + x.s; }), 'v');
  }
  function cardHTML(c, H) {
    var v = null; try { v = state(c); } catch (e) { v = null; }
    if (!v || c.phase !== 'league') return '';
    var h = '';
    if (v.st === 'vote') {
      var o = v.vote, scale = Math.max(o.V, o.topV, 1), fill = Math.round(100 * o.V / scale), cut = Math.round(100 * o.cutV / scale);
      h += '<div class="card as-card as-vote"><h3>' + sep(H, ['Estrellas', 'Votación'], 'd') + (H && H.q ? H.q('Votación', 'Cuentan tu fama, tu nota media, cómo va tu club y tu media frente a las otras figuras. Entran ' + (v.six ? 'por puesto: 2 colocadores, 4 receptores, 2 opuestos y 4 centrales' : '4') + '. Si no llegas, los técnicos pueden elegirte por tus notas y tu nivel.') : '') + '</h3>';
      // (móvil, movil-aire §5.2: votos y cierre en la línea de «Vas 11º», «Top 4» como rótulo de la raya del corte y «Pedir el voto · 2/3»
      //  en una línea con su coste en ficha)
      var asPh = !!(H && H.ph && H.ph());
      h += '<p class="as-line">' + sep(H, asPh ? ['Vas ' + esc(ordn(o.rank)) + (v.six ? ' en tu puesto' : ''), '<span class="nw">' + num(o.votes) + ' votos</span>', '<span class="nw">cierra tras la J' + v.wk + '</span>'] : ['Vas ' + esc(ordn(o.rank)) + (v.six ? ' en tu puesto' : ''), 'entran ' + o.cut], 'v') + '</p>';
      h += '<div class="as-bar" role="img" aria-label="' + esc('Tus votos frente al corte') + '"><i style="width:' + fill + '%"></i><b style="left:' + cut + '%"' + (asPh ? ' data-l="Top ' + o.cut + '"' : '') + '></b></div>';
      if (!asPh) h += '<p class="as-small">' + sep(H, [num(o.votes) + ' votos', 'cierra tras la jornada ' + v.wk], 'v') + '</p>';
      h += '<div class="acts as-acts">' + btn('as-camp', o.camp >= o.campMax ? 'Ya no puedes pedirlo más' : o.asked ? 'Ya lo has pedido esta jornada' : asPh ? 'Pedir el voto (' + (o.camp + 1) + '/' + o.campMax + ')' : 'Pedir el voto (' + (o.camp + 1) + ' de ' + o.campMax + ')', 'sp-gold', o.canCamp ? 'Entrenador −1' : '', !o.canCamp) + '</div></div>';
      return h;
    }
    if (v.st === 'done') {
      if (!v.fresh) return '';
      var mres = v.parts[0].res, bits = [];
      if (mres) bits.push('gana el ' + esc(TEAMS[mres.w].name) + ' ' + Math.max(mres.sc[0], mres.sc[1]) + '-' + Math.min(mres.sc[0], mres.sc[1]));
      v.parts.slice(1).forEach(function (p) { if (p.mine && p.res && p.res.rank) bits.push(esc(p.name) + ' ' + esc(ordn(p.res.rank))); });
      return '<div class="card as-card as-done"><h3>' + sep(H, ['Estrellas', 'Resumen'], 'd') + '</h3><p class="as-line">' + sep(H, bits, 'd') + '</p><div class="acts as-acts">' + btn('as-goto-titles', 'Ver en Palmarés', 'sp-teal') + '</div></div>';
    }
    // fin de semana
    var s = v.sel;
    h += '<div class="card as-card as-event"><h3>' + sep(H, ['Estrellas', 'Fin de semana'], 'd') + (H && H.q ? H.q('Fin de semana de las Estrellas', 'Partido de las Estrellas a un set de 21 y concursos de saques, recepción y remate: 10 repeticiones, hasta 30 puntos, 2 intentos y cuenta el mejor. Si reinicias o sales de un concurso, el intento cuenta 0. Lo que no juegues se simula al pasar de jornada.') : '') + '</h3>';
    h += '<p class="as-line">' + (s.me ? sep(H, [s.me === 'tec' ? 'Por los técnicos' : 'Por votos: ' + esc(ordn(s.rank)), esc(s.team)], 'v') : 'Fuera por votos (' + esc(ordn(s.rank)) + ')') + '</p>';
    if (v.out) h += '<p class="as-small as-warn">' + esc('De baja: solo puedes mirarlo o simularlo' + (s.me && v.sub ? '. Te sustituye ' + v.sub : '')) + '</p>';
    h += '<div class="as-rows">';
    v.parts.forEach(function (p) {
      p.mineT = s.mine;
      var b = '';
      if (p.k === 'm') {
        if (p.can.play) b += btn('as-play-m', p.st === 'live' ? 'Volver a jugar' : 'Jugar', 'sp-gold');
        if (p.can.watch) b += btn('as-watch', 'Mirar', 'sp-teal');
        if (p.can.sim) b += btn('as-sim-m', 'Simular', 'sp-cream');
      } else {
        if (p.can.play) b += btn('as-play-' + p.k, p.can.again ? '2º intento' : 'Jugar', 'sp-gold');
        if (p.can.sim) b += btn('as-sim-' + p.k, p.mine && !v.out ? 'Simular' : 'Ver resultado', 'sp-cream');
      }
      var rk = '';
      if (H && H.ph && H.ph() && !(p.k !== 'm' && more[p.k])) {   // móvil (movil-aire §5.4): fila compacta (nombre + estado, marca, podio en 3 fichas)
        if (p.res && p.k !== 'm') b += btn('as-more-' + p.k, 'Ver los 6', 'sp-cream');
        var pod = p.res && p.k !== 'm' ? '<p class="as-pod" aria-label="' + esc('Podio: ' + p.res.list.slice(0, 3).map(function (x, i) { return ordn(i + 1) + ' ' + (x.me ? 'tú' : x.nm) + ' ' + x.s; }).join(', ')) + '">' +
          p.res.list.slice(0, 3).map(function (x, i) { return '<span' + (x.me ? ' class="me"' : '') + '>' + esc(ordn(i + 1)) + ' ' + (x.me ? 'Tú' : esc(first(x.nm))) + ' ' + x.s + '</span>'; }).join('') + '</p>'
          : p.res ? '<p class="as-pod"><span>' + esc('MVP: ' + p.res.mvp + (p.res.nota != null ? ', nota ' + dec(p.res.nota) : '')) + '</span></p>' : '';
        h += '<div class="as-row as-rph"><p class="as-rt"><b class="as-rn">' + esc(p.name) + '</b><span class="tag y as-tag">' + esc(tagOf(p)) + '</span></p><span class="as-rm">' + esc(p.meta) + '</span>' + pod +
          (b ? '<div class="acts as-acts">' + b + '</div>' : '') + '</div>';
        return;
      }
      if (p.res && p.k !== 'm') {
        rk = '<p class="as-rk">' + (more[p.k] ? '' : compact(p.res.list, H)) + '</p>' + (more[p.k] ? rankHTML(p.res.list) : '');
        b += btn('as-more-' + p.k, more[p.k] ? 'Menos' : 'Ver los 6', 'sp-cream');
      } else if (p.res && p.k === 'm') rk = '<p class="as-rk">' + sep(H, ['MVP: ' + esc(p.res.mvp)].concat(p.res.nota != null ? ['Tu nota: ' + dec(p.res.nota)] : []), 'v') + '</p>';
      h += '<div class="as-row"><div class="as-rh"><b class="as-rn">' + esc(p.name) + '</b><span class="as-rm">' + esc(p.meta) + '</span></div><span class="tag y as-tag">' + esc(tagOf(p)) + '</span>' + rk +
        (b ? '<div class="acts as-acts">' + b + '</div>' : '') + '</div>';
    });
    h += '</div>';
    h += '<p class="as-small">' + esc('Se cierra al jugar o simular la jornada ' + (v.wk + 1)) + '</p>';
    if (v.left) h += '<div class="acts as-acts">' + btn('as-sim-all', 'Simular lo que falta', 'sp-cream') + '</div>';
    return h + '</div>';
  }
  function honorsHTML(c, H) {
    if (!A.enabled || !obj(c)) return '';
    var a = ensure(c); if (!a || !a.log.length) return '';
    var star = 0, mvp = 0, wins = 0;
    a.log.forEach(function (e) { if (e.sel) star++; if (e.m.mvpMe) mvp++; ['srv', 'rcv', 'atk'].forEach(function (k) { if (e.ct[k].rank === 1) wins++; }); });
    var h = '<div class="card as-card as-hon"><h3>' + sep(H, ['Estrellas y concursos'], 'd') + '</h3><p class="muted as-small">No son títulos oficiales</p>';
    h += '<p class="as-tot">' + sep(H, [star === 1 ? '1 vez Estrella' : star + ' veces Estrella', mvp === 1 ? '1 MVP' : mvp + ' MVP', wins === 1 ? '1 concurso ganado' : wins + ' concursos ganados'], 'v') + '</p>';
    a.log.slice().reverse().forEach(function (e) {
      var m = e.m, top = [esc(e.sel === 'vote' ? 'Estrella (' + ordn(e.rank) + ' en votos)' : e.sel === 'tec' ? 'Estrella (técnicos)' : 'Sin plaza (' + ordn(e.rank) + ')')];
      if (m.w >= 0) top.push(esc((e.sel ? (m.w === m.mine ? 'Gana ' : 'Pierde ') + TEAMS[m.mine].short : 'Gana ' + TEAMS[m.w].short) + ' ' + Math.max(m.sc[0], m.sc[1]) + '-' + Math.min(m.sc[0], m.sc[1])));
      if (m.mvpMe) top.push('MVP');
      var chips = ['srv', 'rcv', 'atk'].map(function (k) { var x = e.ct[k]; return '<span class="as-chip' + (x.rank === 1 ? ' as-win' : '') + '">' + esc(CT().CONTESTS[k].short + ' ' + (x.rank ? ordn(x.rank) + (x.s ? ' (' + x.s + ')' : '') : '—')) + '</span>'; }).join('');
      h += '<div class="as-ed"><p class="as-et">' + sep(H, ['T' + e.s + (e.name ? ' ' + esc(e.name) : '')].concat(top), 'v') + '</p><p class="as-chips">' + chips + '</p></div>';
    });
    return h + '</div>';
  }
  function dot(c, where) {
    if (where !== 'match') return false;
    var v = null; try { v = state(c); } catch (e) { v = null; }
    if (!v || c.phase !== 'league') return false;
    if (v.st === 'vote') return !!v.vote.canCamp;
    if (v.st === 'event') return v.parts.some(function (p) { return p.can && p.can.play; });
    return false;
  }
  function act(act) {
    var C = VB.Career, c = C && C.get ? C.get() : null; if (!c) return null;
    var cur = curOf(c);
    if (act === 'as-camp') return camp(c) ? { render: true, snd: 'select' } : false;
    if (act === 'as-goto-titles') return { tab: 'honors', s: 'titles' };
    if (act.indexOf('as-more-') === 0) { var mk = act.slice(8); more[mk] = !more[mk]; return { render: true }; }
    if (!cur || cur.st !== 'event' || !live(c)) return false;
    if (act === 'as-play-m') return canPlay(c, cur) && (cur.m.st === 'pend' || cur.m.st === 'live') ? { play: { id: ID, arg: 'm', auto: false } } : false;
    if (act === 'as-watch') return !canPlay(c, cur) && (cur.m.st === 'pend' || cur.m.st === 'live') ? { play: { id: ID, arg: 'm', auto: true } } : false;
    if (act === 'as-sim-all') { var n = simAll(c); if (n) save(c); return n ? { render: true } : false; }
    if (act.indexOf('as-sim-') === 0) { var k = act.slice(7); if (!simPart(c, k)) return false; save(c); if (k !== 'm') more[k] = true; return { render: true }; }
    if (act.indexOf('as-play-') === 0) { var q = act.slice(8); return contestCan(c, cur, q) === 'ok' ? { drill: { id: ID, arg: q, auto: false } } : false; }
    return null;
  }

  // ------------------------------------------------------------------ CSS (SPLAT; móvil con :root.ph y tokens --ph-*)
  var Q = ':root:not(#_):not(#_):not(#_) #career', PQ = ':root.ph:not(#_):not(#_):not(#_) #career', SH = ':is(#gymEnd,#endExt)', PSH = ':root.ph:not(#_):not(#_):not(#_) ' + SH;
  function css() {
    return [
      '#career .as-card .as-line{margin:4px 0 8px;font:600 15px/1.35 var(--sp-ui,var(--ui))}',
      '#career .as-small{margin:4px 0 8px;font:600 13px/1.35 var(--sp-ui,var(--ui));opacity:.88}',
      '#career .as-warn{color:#ffb4a8;opacity:1}',
      '#career .as-bar{position:relative;height:14px;margin:8px 2px 6px;border-radius:8px;background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 2px rgba(21,16,42,.55)}',
      '#career .as-bar>i{position:absolute;left:0;top:0;bottom:0;border-radius:8px;background:linear-gradient(90deg,#ff8c1a,#ffd23f)}',
      '#career .as-bar>b{position:absolute;top:-5px;bottom:-5px;width:4px;margin-left:-2px;border-radius:2px;background:#fff;box-shadow:0 0 0 2px #15102a}',
      '#career .as-rows{display:flex;flex-direction:column;gap:10px;margin:8px 0 6px}',
      '#career .as-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;align-items:center;padding:8px 10px;border-radius:12px 16px 13px 17px;background:rgba(21,16,42,.32)}',
      '#career .as-rh{min-width:0}',
      '#career .as-rn{display:block;font:400 17px/1.15 var(--sp-pop,var(--display));letter-spacing:.01em}',
      '#career .as-rm{display:block;font:600 13px/1.3 var(--sp-ui,var(--ui));opacity:.88;overflow-wrap:anywhere}',
      '#career .as-tag{justify-self:end;white-space:nowrap;font-size:12.5px}',
      '#career .as-rk{grid-column:1/-1;margin:2px 0 0;font:600 13px/1.35 var(--sp-ui,var(--ui))}',
      '#career .as-rk b{color:#ffd23f}',
      '#career .as-row .acts,#career .as-card>.acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}',
      '#career .as-row .acts{grid-column:1/-1}',
      Q + ' .acts.as-acts>.sp-btn,' + Q + ' .acts.as-acts>button{flex:0 1 210px;min-width:0;max-width:240px;min-height:44px}',
      '#career .as-acts .sp-btn .sp-t{white-space:normal;line-height:1.1}',
      '#career .as-tot{margin:6px 0 10px;font:600 15px/1.35 var(--sp-ui,var(--ui))}',
      '#career .as-ed{padding:8px 0;border-top:2px dashed rgba(255,255,255,.18)}',
      '#career .as-et{margin:0 0 6px;font:600 14px/1.35 var(--sp-ui,var(--ui))}',
      '#career .as-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0}',
      '#career .as-chip{display:inline-block;padding:3px 10px;border-radius:10px 13px 11px 14px;background:rgba(255,255,255,.12);font:700 12.5px/1.3 var(--sp-ui,var(--ui))}',
      '#career .as-chip.as-win{background:#ffd23f;color:#15102a}',
      Q + ' .as-card ol.as-rank,' + SH + ' ol.as-rank{list-style:none;margin:6px 0;padding:0;display:grid;gap:3px;font:600 14px/1.3 var(--sp-ui,var(--ui))}',
      Q + ' .as-card ol.as-rank{grid-column:1/-1}',
      Q + ' .as-card ol.as-rank li,' + SH + ' ol.as-rank li{display:flex;justify-content:space-between;gap:10px;padding:2px 8px;border-radius:8px;background:rgba(21,16,42,.28)}',
      Q + ' .as-card ol.as-rank li.me,' + SH + ' ol.as-rank li.me{background:#ffd23f;color:#15102a}',
      SH + ' .as-p{margin:4px 0;font:600 14px/1.35 var(--sp-ui,var(--ui))}',
      SH + ' .as-gold{color:#ffd23f}',
      SH + ' .as-mut{opacity:.8}',
      SH + ' .as-sc{display:flex;align-items:center;justify-content:center;gap:12px;margin:4px 0 8px;font:400 18px/1.1 var(--sp-pop,var(--display))}',
      SH + ' .as-sc .as-n{font:900 30px/1 var(--display);font-variant-numeric:tabular-nums}',
      SH + ' .as-t0{color:#ffb35c}' + SH + ' .as-t1{color:#9ad1ff}',
      SH + ' .as-place{display:inline-grid;place-items:center;align-content:center;width:76px;height:76px;border-radius:18px 22px 19px 23px;background:#2f55d4;color:#fff;box-shadow:0 0 0 3px #15102a,4px 5px 0 #15102a;transform:rotate(-2deg)}',
      SH + ' .as-place.as-p1{background:#ff8c1a}',
      SH + ' .as-place b{font:900 36px/.9 var(--display)}' + SH + ' .as-place small{font:800 12px/1 var(--display);letter-spacing:.12em;margin-top:3px}',
      '@media (max-height:420px){' + SH + ' .as-place{width:56px;height:56px}' + SH + ' .as-place b{font-size:26px}}',
      // escritorio ancho: los botones de cada parte en su misma fila (menos alto)
      '@media (min-width:900px){html:not(.ph) #career .as-row{grid-template-columns:minmax(0,1fr) auto auto}html:not(.ph) #career .as-row>.acts{grid-column:2;grid-row:1;margin-top:0;flex-wrap:nowrap}html:not(.ph) #career .as-row>.as-tag{grid-column:3;grid-row:1}:root:not(.ph):not(#_):not(#_):not(#_) #career .as-row .acts.as-acts>.sp-btn{flex:0 0 auto;min-width:150px;max-width:none}}',
      // móvil (html.ph): tokens, nada por debajo de 12 px, toques de 44
      PQ + ' .as-card .as-line{font-size:var(--ph-body,15px)}',
      // votación (movil-aire, paquete carrera-marco): raya del corte con su rótulo y «Pedir el voto · 2/3» de 48 en una línea, coste en ficha
      // (ronda final) la línea deja sitio al «?» de la esquina y «Top 4» va DEBAJO de la barra (encima pisaba «cierra tras la J5»)
      PQ + ' .as-vote .as-line{font-size:var(--ph-cap,13px);margin:2px 0 4px;padding-right:48px}',
      PQ + ' .as-vote .as-bar{margin:10px 2px 26px}',
      PQ + ' .as-vote .as-bar>b[data-l]::after{content:attr(data-l);position:absolute;top:calc(100% + 5px);left:50%;transform:translateX(-50%);font:700 12px/1 var(--sp-ui,sans-serif);color:var(--sp-gold,#ffd23f);white-space:nowrap}',
      PQ + ' .as-vote .acts.as-acts>.sp-btn{flex:0 0 auto;max-width:none;--sp-h:48px;min-height:48px}',
      PQ + ' .as-vote .as-acts .sp-l{flex-direction:row;align-items:center;gap:8px;white-space:nowrap}',
      PQ + ' .as-vote .as-acts .sp-t{white-space:nowrap}',
      PQ + ' .as-vote .as-acts .sp-s{padding:1px 7px;border-radius:7px 10px 8px 11px;background:var(--sp-ink,#15102a);color:var(--sp-cream,#fff4dc);font-size:12px;opacity:1}',
      PQ + ' .as-small,' + PQ + ' .as-rm,' + PQ + ' .as-rk,' + PQ + ' .as-chip,' + PQ + ' .as-tag{font-size:max(12px,var(--ph-cap,12px))}',
      PQ + ' .as-rn{font-size:var(--ph-row,16px)}',
      PQ + ' .as-tot,' + PQ + ' .as-et{font-size:var(--ph-body,15px)}',
      PQ + ' .as-row{grid-template-columns:minmax(0,1fr) auto;padding:8px 10px}',
      PQ + ' .as-row .acts,' + PQ + ' .as-card>.acts{gap:var(--ph-hit-gap,10px)}',
      PQ + ' .acts.as-acts>.sp-btn{min-height:44px;flex:0 1 190px;max-width:230px}',
      PQ + ' .as-bar{height:16px}',
      PQ + ' ol.as-rank{font-size:var(--ph-label,13px)}',
      PSH + ' ol.as-rank,' + PSH + ' .as-p{font-size:max(12px,var(--ph-label,13px))}',
      PSH + ' .as-place small{font-size:12px}'
    ].join('\n');
  }
  /** Fuera del hub (hojas finales, escenas de prueba): el CSS una vez en #as-css. */
  function cssIn() {
    try { if (typeof document === 'undefined' || !document.head || !document.createElement || document.getElementById('as-css')) return; var st = document.createElement('style'); st.id = 'as-css'; st.textContent = css(); document.head.appendChild(st); } catch (e) { }
  }

  // ------------------------------------------------------------------ muestras (mobaudit, capturas, pruebas)
  function forceOpen(c) {
    var a = ensure(c), cal = calOf(c) || { mid: (c.week | 0) + 3, w0: c.week | 0 };
    var cur = a.cur = open(c, { mid: Math.max((c.week | 0) + 1, cal.mid), w0: c.week | 0 });
    return cur;
  }
  /** Deja la Carrera c lista para la captura (vote | event | log) y guarda. Prepara lo que haga falta: fuera de la liga (copa, eliminatorias
   *  o fin de temporada, p. ej. tras otra muestra que ha simulado la temporada entera) acaba la temporada y empieza la siguiente. */
  function _demo(c, k) {
    c = c || (VB.Career && VB.Career.get()); if (!obj(c) || !(c.myClub >= 0) || prologueOn(c)) return false;
    if (c.phase !== 'league') c = demoLeague(c);
    if (!obj(c) || c.phase !== 'league' || !(c.myClub >= 0) || !calOf(c)) return false;
    var cur = forceOpen(c);
    if (k === 'vote') { cur.camp = 1; cur.cw = -1; save(c); return true; }
    cur.wk = c.week | 0; result(c, cur);
    if (k === 'event') {
      var p = cur.srv; if (!p.mine) { p.mine = true; p.riv = rivalsOf(c, cur, 'srv', true); cur.sel.inv.srv = true; }
      p.n = 1; p.best = Math.max(p.riv[0] ? p.riv[0].s + 1 : 20, 18); p.st = 'play'; payContest(c, cur, 'srv', false);
      more.srv = false; save(c); return true;
    }
    if (k === 'log') { simAll(c); close(c, cur); save(c); return true; }
    save(c); return true;
  }
  /** (solo muestras) Lleva la Carrera c a la liga de la temporada siguiente: simula lo que quede y sigue en tu club. Devuelve la carrera. */
  function demoLeague(c) {
    var E = K(c), C = VB.Career, g = 0; if (!E || !C) return c;
    var mode = hall(c) ? 'hall' : 'beach', reget = function () { var x = null; try { if (C.setMode) C.setMode(mode); x = C.get(); } catch (e) { } return obj(x) ? x : c; };
    while (c.phase !== 'off' && c.phase !== 'league' && g++ < 300) {
      var nx = E.next ? E.next(c) : null;
      if (nx && nx.bench && E.benchNext) E.benchNext(c); else if (!E.simulateNext || !E.simulateNext(c)) break;
      c = reget();
    }
    if (c.phase === 'off') { try { E.save(c); if (E.stay) E.stay(1); } catch (e) { } c = reget(); }
    return c;
  }
  var DEMO_NAMES = ['Alex Ruiz', 'Sam Vidal', 'Noa Ferrer', 'Dani Soler', 'Eli Prat'];
  function _endDemo() {
    cssIn();
    var cur = { sel: { mine: 0 }, m: { w: 0, sc: [21, 18], nota: 7.8, mvp: 'Tú', mvpMe: true, me: true, fame: 640, money: 1000, look: 'Estrella en la mejilla' } };
    var out = matchSheet({ player: { name: 'Tú' } }, cur);
    if (out && typeof out === 'object') out.dbgSets = [cur.m.sc.slice()];   // (main.js: la cabecera con el mismo 21-18 de la hoja)
    // (ronda 2, carrera-flujo-v) la cabecera con los equipos de verdad (SOL / LUN, como el partido real: setup pone career.me/rival = TEAMS[].k);
    // la muestra salía con el TÚ / VAL genérico de debug=over&cr=1
    if (out && typeof out === 'object') out.cs = { me: TEAMS[0].k, rival: TEAMS[1].k, meName: TEAMS[0].name, rivalName: TEAMS[1].name, clubName: TEAMS[0].name };
    return out;
  }
  function _drillDemo(k) {
    cssIn(); k = CT() && CT().CONTESTS[k] ? k : 'srv';
    var riv = [23, 20, 18, 15, 12].map(function (s, i) { return { nm: DEMO_NAMES[i], s: s }; }), list = CT().rank(24, riv);
    return { res: drillRes(k, 24, 24, list, 1, { fame: 160, money: 600, look: LOOK_N[LOOKS[k]] }, 1, CT().ORDER[(CT().ORDER.indexOf(k) + 1) % 3]), n: 1, max: CT().TRIES,
      label: CT().CONTESTS[k].short, kit: Object.assign(copy(KITS[0]), { scrim: copy(SCRIM) }), mode: 'beach', pause: copy(PAUSE_D) };
  }

  // ------------------------------------------------------------------ fachada y registro
  A.ensure = ensure; A.hook = hook; A.state = state; A.setup = setup; A.done = done; A.quit = quit;
  A.drillSetup = drillSetup; A.drillDone = drillDone; A.drillQuit = drillQuit;
  A.simPart = simPart; A.simAll = simAll; A.camp = camp; A.cardHTML = cardHTML; A.honorsHTML = honorsHTML; A.css = css; A.act = act; A.dot = dot;
  A._demo = _demo; A._endDemo = _endDemo; A._drillDemo = _drillDemo;
  A._t = { VOTE: VOTE, PTS: PTS, KITS: KITS, TEAMS: TEAMS, QUOTA6: QUOTA6, LOOKS: LOOKS, FAME: FAME, voteOf: voteOf, poolOf: poolOf, selOf: selOf, rankOf: rankOf,
    calOf: calOf, close: close, tecPick: tecPick, invBest: invBest, cutOvr: cutOvr, gapOf: gapOf, cmpOvr: cmpOvr, notaInfo: notaInfo, fameTop: fameTop, result: result, open: open, live: live, K: K, matchSheet: matchSheet, rivalsOf: rivalsOf, more: more };
  VB.CareerAllstar = A;

  // quitStrict: salir a mitad ya castiga (se simula sin ti, quit): «Retomar el partido» en la Carrera (main.js toMenu) no lo guarda al salir
  var X = { id: ID, quitStrict: true, hook: function (c, k, a, b) { hook(c, k, a, b); }, setup: setup, done: done, quit: quit, drillSetup: drillSetup, drillDone: drillDone,
    drillQuit: drillQuit, _demo: _demo, _endDemo: _endDemo, _drillDemo: _drillDemo };
  (VB.CareerExt = VB.CareerExt || []).push(X);
  (VB.CareerUIExt = VB.CareerUIExt || []).push({ id: ID, prefix: 'as-', match: cardHTML, honors: honorsHTML, act: act, css: css, dot: dot });
})(typeof window !== 'undefined' ? window : globalThis);
