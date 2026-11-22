/* TAKE THE COURT — js/career-coop.js (owner: carrera; sprint online-multi, paquete P7, notes/online-multi-brief.md §6)
 * Carrera cooperativa de PLAYA (VB.CareerCoop): dos personas en dos aparatos juegan los partidos de liga y del Open de la Carrera del
 * ANFITRIÓN, juntas en el equipo 0 contra la IA (online de varios, Precisa con 2 plazas). Es una extensión de VB.CareerExt (CONTRACT.md
 * «Extensiones de la Carrera»): ensure idempotente, sin subir VER, azar solo por hash de la semilla (_rng(_hash(c.seed, 'coop', …))),
 * sin DOM al cargar (se carga en node con vm: tools/cooptest.js).
 *
 * Decisiones por defecto (Ferran las confirmará; lista en notes/online-multi-requests.md P7):
 *  - La Carrera es del anfitrión: vive solo en SU guardado. El invitado la ve desde un almacén en memoria (VB.Career._useStore): nunca
 *    la escribe en localStorage ni en la nube (account.js la subiría encima de la suya).
 *  - El invitado es la pareja de playa del anfitrión (sustituye al compañero de la IA mientras dura el cooperativo) con su propio
 *    jugador: c.coop.p2 = atleta (nombre, dorsal, rol, nivel, XP, puntos, insignias) dentro de la Carrera del anfitrión. Empieza con los
 *    atributos del compañero de la IA de ese momento (el equipo rinde igual) y nivel 1. El invitado guarda una copia de su p2 en
 *    'make-the-cut.coop.p2' (solo su registro; no se sube a la cuenta).
 *  - La Carrera solo avanza cuando el anfitrión avanza. El invitado puede gastar SUS puntos e insignias y pulsar «Listo»; lo demás es de
 *    solo lectura para él. Sin invitado conectado, el anfitrión juega con el compañero de la IA, como siempre.
 *  - Solo los partidos de liga y del Open. Los de las extensiones (selección, Estrellas, juvenil, pruebas) siguen siendo solo del
 *    anfitrión. Los simulados no dan XP a p2. La Carrera de pista en cooperativo: «Pronto» (espera al 6 contra 6 online).
 *  - Si entra OTRA persona (otro id), su p2 es nuevo; el anterior se archiva en c.coop.old (hasta 3) y vuelve si regresa.
 *  - v1: sin ambiente (noAmb), sin zona (noZone) y sin «Te tienen estudiado» en el partido cooperativo.
 *
 * Guardado (opcional, solo si se ha usado el cooperativo): c.coop = {v:1, on, uid2, name2, p2, stats2, notes2, chem, joined, lastSync,
 * old?, pend?}. Sin c.coop la Carrera es idéntica (careertest con y sin NOEXT).
 *
 * Conexión: VB.NetLobby.coop (P6, contrato en la cabecera «CARRERA COOPERATIVA» de netlobby.js) = { host(cfg), join(cfg), close(),
 * send(obj), onMessage(fn) → quitar, state() }. host/join llaman a cfg.onReady({link, seat, names, looks, room}) con el enlace abierto
 * y a cfg.onClose(why) al cortarse. link es la fachada del lobby: se pasa tal cual a startOnline (mientras la sesión la lee, el lobby
 * no; su close() al acabar el partido la devuelve al lobby sin cortarla) y los mensajes de la app siguen llegando durante el partido.
 * Mensajes (objetos, fiables y en orden por ctl; el lobby trocea lo grande), campo t:
 *   invitado → anfitrión: hi {id, name, num, ver, gz, aimSet, jsetAim}, need {rev}, int {a: 'up'|'badge', k}, ready {on}
 *   anfitrión → invitado: snap {rev, z: 'gz'|'', d}, play {humans: [{name, look}×2]}, bye {why}, st {w: 'hub'|'solo'|'menu'} (qué
 *     hace el anfitrión, para la pantalla del invitado), sum {sum, cs, x, rec} (el «Resumen de la jornada» del invitado y la copia
 *     nueva de su p2, justo tras matchDone, con la hoja final a la vista)
 * Partido: el anfitrión manda play y los dos llaman a ctx.actions.startCoopCareerMatch (main.js). Al acabar (ctx.net cambia) el
 * anfitrión manda la foto nueva (en pleno partido no: la Carrera no cambia hasta matchDone).
 * Insignias (L4, 22-nov-2026): las cuenta career-coop con los eventos CONFIRMADOS (feed → VB.Badges.ingest sobre la vista confirmada,
 * para el anfitrión y para p2); ui.js no las cuenta con ctx.net.coopCareer (lo presentado tras un retroceso contaba de más o de menos).
 * Hoja final: los dos ven el «Resumen de la jornada» (VB.UI.endCareer): el anfitrión, el suyo; el invitado, el de su p2 (mensaje sum).
 * Pantallas del invitado (SPLAT, #coSheet): «esperando la Carrera» y «se ha cortado» (vuelve a SU menú; su p2 queda en P2_KEY); en el
 * hub, la tarjeta de arriba dice qué hace el anfitrión (eligiendo, jugando sin ti…) y lleva a su jugador.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var P2_KEY = 'make-the-cut.coop.p2', CKEY = 'make-the-cut.career', MKEY = 'make-the-cut.career.mode';
  var KINDS = ['league', 'cup'];                 // partidos que se juegan en cooperativo (v1)
  var GUEST_OK = ['close', 'hub', 'lgsheet', 'est', 'lvl', 'lg6', 'st-plan', 'st-fold-last', 'st-jump'];   // el invitado: solo mirar
  var CODE_RE = /^[2-9A-HJKMNP-Z]{6}$/;
  var NOTES2_MAX = 40, OLD_MAX = 3, POLL_MS = 1500, NEED_MS = 2500;

  function KB() { return VB.Career && VB.Career.beach; }
  function eng(c) { var C = VB.Career; return C && C.ext && C.ext.engine ? C.ext.engine(c) : KB(); }
  function L() { var N = VB.NetLobby; return N && N.coop && typeof N.coop.host === 'function' ? N.coop : null; }
  function clampI(v, a, b) { v = Math.round(+v); return isFinite(v) ? Math.max(a, Math.min(b, v)) : a; }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function cleanName(s) { return String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18); }
  function normCode(s) { return String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6); }
  function isHall(c) { return !!(c && c.mode === 'hall'); }
  function log(m, e) { try { console.error('CareerCoop ' + m, e); } catch (e2) { } }

  // ================================================================== datos (puros: tools/cooptest.js)
  function zeros() { return { played: 0, won: 0, pts: 0, kills: 0, aces: 0, blocks: 0, assists: 0, digs: 0, errors: 0 }; }
  /** Atleta p2 saneado (null si no vale). Con VB.Prog, sobre su plantilla (como c.player en career.js sane). */
  function saneP2(p, Kc) {
    if (!p || typeof p !== 'object' || !p.st || typeof p.st !== 'object') return null;
    var P = VB.Prog, R = (Kc || KB() || {}).ROLES || {}, d;
    if (P && P.newAthlete && P.saneAthlete) { d = P.newAthlete({ num: p.num, role: p.role, name: p.name }); P.saneAthlete(p, d); }
    else d = p;
    d.roleKey = R[p.roleKey] ? p.roleKey : 'uni';
    if (R[d.roleKey]) d.role = R[d.roleKey].name;
    d.age = clampI(p.age, 15, 60);
    d.name = cleanName(p.name) || 'Pareja';
    d.num = clampI(p.num, 1, 99);
    return d;
  }
  /** c.coop idempotente (no se crea solo: ensure se llama al usar el cooperativo). Devuelve c.coop o null. */
  function ensure(c) {
    if (!c || typeof c !== 'object') return null;
    var o = c.coop && typeof c.coop === 'object' && !Array.isArray(c.coop) ? c.coop : (c.coop = {}), Kc = eng(c);
    o.v = 1; o.on = !!o.on;
    if (typeof o.uid2 !== 'string') o.uid2 = '';
    o.name2 = cleanName(o.name2);
    // (saneado sobre el MISMO objeto: career.js matchDone guarda la referencia de c.coop.p2 antes de coopMatch para las insignias)
    var p0 = o.p2; o.p2 = saneP2(o.p2, Kc);
    if (o.p2 && p0 && typeof p0 === 'object' && p0 !== o.p2) { Object.keys(p0).forEach(function (k) { delete p0[k]; }); Object.assign(p0, o.p2); o.p2 = p0; }
    var z = zeros(), s = o.stats2 && typeof o.stats2 === 'object' ? o.stats2 : {};
    Object.keys(z).forEach(function (k) { z[k] = num(s[k]) ? Math.max(0, s[k] | 0) : 0; });
    o.stats2 = z;
    // ss2 = {s: temporada, st}: los números de p2 en la temporada en curso (stats2 es el total del cooperativo)
    if (o.ss2 && typeof o.ss2 === 'object' && o.ss2.st && typeof o.ss2.st === 'object') {
      var z2 = zeros(); Object.keys(z2).forEach(function (k) { z2[k] = num(o.ss2.st[k]) ? Math.max(0, o.ss2.st[k] | 0) : 0; });
      o.ss2 = { s: clampI(o.ss2.s, 0, 9999), st: z2 };
    } else delete o.ss2;
    o.notes2 = Array.isArray(o.notes2) ? o.notes2.filter(function (n) { return n && num(n.nota); }).slice(-NOTES2_MAX) : [];
    o.chem = num(o.chem) ? clampI(o.chem, 0, 100) : 0;
    o.joined = num(o.joined) ? o.joined : 0;
    o.lastSync = num(o.lastSync) ? o.lastSync : 0;
    if (o.old && typeof o.old === 'object' && !Array.isArray(o.old)) { Object.keys(o.old).forEach(function (k) { var x = o.old[k]; if (!x || typeof x !== 'object' || !saneP2(x.p2, Kc)) delete o.old[k]; }); }
    else delete o.old;
    return o;
  }
  /** Dorsal de p2: el que pide el invitado si está libre; si no, el del compañero de la IA; si no, uno libre al azar (hash de la semilla). */
  function pickNum(c, want, r) {
    var mine = c.player ? c.player.num | 0 : 0;
    want = want | 0;
    if (want >= 1 && want <= 99 && want !== mine) return want;
    if (c.mate && (c.mate.num | 0) >= 1 && (c.mate.num | 0) !== mine) return c.mate.num | 0;
    for (var i = 0; i < 50; i++) { var n = 1 + Math.floor(r() * 99); if (n !== mine) return n; }
    return mine === 7 ? 8 : 7;
  }
  /** p2 nuevo para la persona g = {id, name, num}: atributos del compañero de la IA de ahora (o los de inicio de su rol), nivel 1. */
  function newP2(c, g) {
    var Kc = eng(c), P = VB.Prog, mt = c.mate, rk = mt && Kc.ROLES[mt.roleKey] ? mt.roleKey : 'uni';
    var r = Kc._rng(Kc._hash(c.seed, 'coop', 'p2', g.id || g.name || ''));
    var st = mt && mt.st ? copy(mt.st) : Kc.genSt(Kc.START_OVR, rk, null), n = pickNum(c, g.num, r), name = cleanName(g.name) || 'Pareja';
    var a = P && P.newAthlete ? P.newAthlete({ num: n, role: Kc.ROLES[rk].name, name: name, st: st })
      : { num: n, role: Kc.ROLES[rk].name, name: name, lvl: 1, xp: 0, pts: 0, st: st, matches: 0, bp: {}, bd: {}, beq: [] };
    a.roleKey = rk; a.age = clampI(mt && mt.age ? mt.age : c.player && c.player.age || 18, 15, 60);
    return a;
  }
  /** La persona g = {id, name, num} se une al cooperativo de la Carrera c: su p2 (el que ya tenía, uno archivado o uno nuevo). */
  function adopt(c, g, now) {
    var o = ensure(c); if (!o) return null;
    g = g || {}; var id = String(g.id || cleanName(g.name) || 'invitado').slice(0, 64), name = cleanName(g.name) || o.name2 || 'Pareja';
    if (o.p2 && o.uid2 && o.uid2 !== id) {   // otra persona: el p2 de antes al archivo (hasta OLD_MAX, el más viejo fuera)
      o.old = o.old || {};
      o.old[o.uid2] = { name: o.name2, p2: o.p2, stats2: o.stats2, notes2: o.notes2, chem: o.chem, at: num(now) ? now : 0 };
      if (o.ss2) o.old[o.uid2].ss2 = o.ss2;   // (sus números de la temporada se van con él: el nuevo no los hereda)
      var ks = Object.keys(o.old).sort(function (a, b) { return (o.old[a].at || 0) - (o.old[b].at || 0); });
      while (ks.length > OLD_MAX) delete o.old[ks.shift()];
      o.p2 = null; o.stats2 = zeros(); o.notes2 = []; o.chem = 0; delete o.ss2;
    }
    if (!o.p2 && o.old && o.old[id]) {   // vuelve alguien que ya jugó: lo suyo
      var b = o.old[id]; o.p2 = saneP2(b.p2, eng(c)); o.stats2 = b.stats2 || zeros(); o.notes2 = b.notes2 || []; o.chem = b.chem | 0; delete o.old[id];
      if (b.ss2) o.ss2 = b.ss2; else delete o.ss2;   // (ensure lo sanea; si es de otra temporada, creditMate lo empieza de cero)
      ensure(c);
    }
    if (!o.p2) o.p2 = newP2(c, { id: id, name: name, num: g.num });
    o.p2.name = name;
    o.uid2 = id; o.name2 = name; o.on = true;
    if (!o.joined) o.joined = num(now) ? now : 0;
    return o;
  }
  /** Bonus de química del cooperativo (como chemBonus de career.js: 30 → +1, 60 → +2, 90 → +3). */
  function chemB(o) { return Math.min(3, Math.floor(clampI(o && o.chem, 0, 100) / 30)); }
  /** Gancho 'setup' (solo preparando el partido cooperativo, S.prep): p2 en lugar del compañero de la IA. */
  function applySetup(c, out) {
    var o = c.coop, p2 = o && o.p2, Kc = eng(c);
    if (!p2 || !out || !out.attrs || !out.attrs[0] || !out.career || out.career.trial || out.career.ext) return false;
    var cb = chemB(o), ch0 = out.chem | 0, CK = Kc.CHEM_KEYS || [], me = copy(out.attrs[0][0] || {}), st2 = {};
    (Kc.KEYS || Object.keys(p2.st)).forEach(function (k) {
      var x = CK.indexOf(k) >= 0;
      if (me[k] != null) me[k] = clampI(me[k] - (x ? ch0 : 0) + (x ? cb : 0), 1, 99);
      st2[k] = clampI((p2.st[k] | 0) + (x ? cb : 0), 1, 99);
    });
    out.attrs = [[me, st2], out.attrs[1]];
    var B = VB.Badges, bd = null;
    try { bd = B && B.forPlayer ? B.forPlayer(p2) : null; } catch (e) { bd = null; }
    if (bd && !Object.keys(bd).length) bd = null;
    var b0 = out.badges && out.badges[0] ? out.badges[0][0] || null : null;
    out.badges = b0 || bd ? [[b0, bd], out.badges ? out.badges[1] || null : null] : null;
    out.chem = cb; out.mateForm = 0;
    out.career.mate = p2.name; out.career.mateNum = p2.num | 0;
    out.career.coop = true; out.career.noAmb = true; out.career.noZone = true;
    out.coop = { slot2: { team: 0, idx: 1 } };
    return true;
  }
  /** Cierre de p2 tras un partido cooperativo (career.js matchDone → extCall('coopMatch')): nota con rating() de sus números (m.p[1],
   *  que slotOf ya cuenta), XP con la fórmula de closeMine, estadísticas, química. Deja c.coop.pend para el resumen (gancho 'match'). */
  function creditMate(c, m, res, rallies) {
    var o = ensure(c); if (!o || !o.p2 || !res || !res.sets) return null;
    var Kc = eng(c), s = m && m.p && m.p[1] || {}, win = res.sets[0] > res.sets[1];
    var me = { kills: s.kills | 0, aces: s.aces | 0, blocks: s.blocks | 0, assists: s.assists | 0, digs: s.digs | 0, errors: s.errors | 0,
      recvP: s.recvP | 0, perfect: s.perfect | 0, good: s.good | 0, poor: s.poor | 0 };
    var nota = Kc.rating(me, { win: win, sets: res.sets }, rallies | 0);
    var mpts = me.kills + me.aces + me.blocks, k = Kc.myClub(c), Lg = Kc.league(k ? k.lvl : 0), D = (Kc.CDIFF || {})[Kc.diffOf ? Kc.diffOf(c) : 'normal'] || { xp: 1 };
    var xp = Math.round((40 + 22 * nota + (win ? 40 : 0) + 6 * Math.min(mpts, 10)) * (Lg.xp || 1) * (D.xp || 1) * (Kc.XP_K || 1));
    var lv = Kc._addXP(o.p2, xp);
    if (!o.ss2 || o.ss2.s !== (c.season | 0)) o.ss2 = { s: c.season | 0, st: zeros() };
    [o.stats2, o.ss2.st].forEach(function (st) {
      st.played++; if (win) st.won++;
      st.pts += mpts; st.kills += me.kills; st.aces += me.aces; st.blocks += me.blocks; st.assists += me.assists; st.digs += me.digs; st.errors += me.errors;
    });
    o.notes2.push({ nota: nota, win: win ? 1 : 0, s: res.sets.slice(), season: c.season | 0 });
    if (o.notes2.length > NOTES2_MAX) o.notes2 = o.notes2.slice(-NOTES2_MAX);
    o.chem = clampI(o.chem + 5, 0, 100);
    o.pend = { name: o.p2.name, nota: nota, xp: xp, lvlUp: lv.lvlUp, lvl: lv.lvl, pts: lv.pts, me: me };
    return o.pend;
  }
  /** Gasta un punto de p2 en k (como bump de career.js sobre c.player). */
  function bumpP2(a, k) {
    var P = VB.Prog, Kc = KB();
    if (P && P.athleteBump) return !!P.athleteBump(a, k, 1);
    var v = a.st[k], cost = Kc && Kc.cost ? Kc.cost(v) : 1, ok = (Kc.KEYS || []).indexOf(k) >= 0 && v < 99 && a.pts >= cost;
    if (ok) { a.pts -= cost; a.st[k] = v + 1; }
    return ok;
  }
  /** Lo que pide el invitado ({a: 'up'|'badge', k}) sobre p2 de c. true si ha cambiado algo (el anfitrión guarda y manda la foto). */
  function applyIntent(c, m) {
    var o = c && c.coop, p2 = o && o.p2; if (!p2 || !m) return false;
    if (m.a === 'up') return bumpP2(p2, String(m.k));
    if (m.a === 'badge') { var B = VB.Badges; return !!(B && B.toggle && B.toggle(p2, String(m.k))); }
    return false;
  }
  /** La Carrera c vista por el invitado: él es el protagonista (c.player = su p2) y el anfitrión su compañero (c.mate). Copia. */
  function guestView(c) {
    var v = copy(c), o = v.coop, p2 = o && o.p2, me = v.player; if (!p2 || !me) return v;
    v.player = p2;
    if (v.mate) {
      var m = v.mate;
      v.mate = Object.assign({}, m, { name: me.name, num: me.num, st: me.st, roleKey: me.roleKey, role: me.role, chem: o.chem | 0, form: 0, age: me.age });
    }
    o.view = 'guest'; o.host = { name: me.name, num: me.num | 0, lvl: me.lvl | 0 };
    // (sus números, no los del anfitrión: temporada, total del cooperativo y notas de esta temporada; la confianza del entrenador y lo
    //  demás del club son del equipo y se ven tal cual)
    var sea = v.season | 0, cnt = function (x) { var z = zeros(); for (var k in z) if (x && num(x[k])) z[k] = x[k] | 0; z.sim = 0; z.bench = 0; return z; };
    var ns = (o.notes2 || []).filter(function (n) { return n && (n.season | 0) === sea; });
    v.notes = ns.map(function (n) { return { nota: n.nota, win: n.win ? 1 : 0, sim: 0, kind: 'league', s: Array.isArray(n.s) ? n.s.slice() : [] }; });
    if (o.ss2 && (o.ss2.s | 0) === sea) v.stats = cnt(o.ss2.st);
    else { v.stats = cnt(null); v.stats.played = ns.length; v.stats.won = ns.filter(function (n) { return n.win; }).length; }
    v.career = cnt(o.stats2);
    if (v.last && v.last.coop) { var q = v.last.coop; v.last.xp = q.xp; v.last.lvlUp = q.lvlUp; v.last.lvl = q.lvl; v.last.ptsGained = q.pts; v.last.nota = q.nota; if (q.me) v.last.me = Object.assign({ nota: q.nota }, q.me); v.last.badges = slot1(v.last.badges); }
    return v;
  }
  /** Las insignias de p2 (hueco 1 de endMatch) como si fueran del protagonista (hueco 0): lo que ve el invitado. */
  function slot1(bs) { return (Array.isArray(bs) ? bs : []).filter(function (b) { return b && b.slot === 1; }).map(function (b) { return Object.assign({}, b, { slot: 0 }); }); }
  /** Datos de la tabla y la barra de nivel del Resumen (como careerEndX de main.js) para el atleta a (c.player o p2). */
  function endX(c, a) {
    var Kb = KB(), x = { ses: null };
    try {
      var me = Kb.myClub ? Kb.myClub(c) : null;
      if (me && Kb.table) {
        x.tbl = Kb.table(c, me.lvl); x.myId = me.id; x.short = {};
        (c.clubs || []).forEach(function (k) { if (k && k.id != null) x.short[k.id] = k.short || k.name || ''; });
      }
      if (me && Kb.posOf) x.pos = Kb.posOf(c, me.id) | 0;
      if (c.review && c.review.pos) x.pos = c.review.pos | 0;
      var n = c.phase === 'off' ? null : Kb.next ? Kb.next(c) : null;
      if (!n) x.next = 'off';
      else if (n.kind === 'league') x.next = 'league';
      else { var st = String(n.label || '').split(' · ').pop().toLowerCase(); x.next = /^final/.test(st) ? 'final' : /semi/.test(st) ? 'semi' : /cuartos/.test(st) ? 'cuartos' : /octavos/.test(st) ? 'octavos' : 'league'; }
      if (a && Kb.need && a.lvl != null) x.bar = { cur: a.xp | 0, need: Kb.need(a.lvl) | 0 };
    } catch (e) { log('endX', e); }
    return x;
  }
  /** Resumen de la jornada del INVITADO a partir del del anfitrión (sum, con sum.coop = lo de p2) y su g.career (cs): él es el
   *  protagonista (cs.player = p2) y el anfitrión su pareja. Fuera lo que es solo del anfitrión (vida, entreno, ofertas, ambiente…). */
  function guestSum(c, sum, cs) {
    var q = sum && sum.coop, p2 = c && c.coop && c.coop.p2; if (!q || !p2) return null;
    var s = copy(sum);
    s.xp = q.xp | 0; s.lvlUp = q.lvlUp | 0; s.lvl = q.lvl | 0; s.ptsGained = q.pts | 0; s.nota = q.nota; s.me = Object.assign({ nota: q.nota }, q.me || {});
    s.badges = slot1(sum.badges);
    ['life', 'rt', 'amb', 'study', 'train', 'auto', 'coach', 'chem', 'mateForm', 'mateForm0', 'inj', 'coop', 'offers', 'part'].forEach(function (k) { delete s[k]; });
    var g = copy(cs || {}), hn = g.player, hnum = g.num;
    g.player = p2.name; g.num = p2.num | 0; g.mate = hn || ''; g.mateNum = hnum | 0;
    var k = KB() && KB().myClub ? KB().myClub(c) : null;
    return { t: 'sum', sum: s, cs: g, x: endX(c, p2), rec: { cid: c.seed >>> 0, host: c.player ? c.player.name : '', club: k ? k.name : '', season: c.season | 0, p2: p2 } };
  }
  /** Lo que llega del otro aparato y acaba en el DOM: copia sin «<» ni «>» en ningún texto (los números siguen siendo números). */
  function cleanDeep(o, d) {
    d = d | 0; if (d > 8) return null;
    if (typeof o === 'string') return o.replace(/[<>]/g, '').slice(0, 400);
    if (typeof o === 'number') return isFinite(o) ? o : 0;
    if (typeof o === 'boolean' || o == null) return o;
    if (Array.isArray(o)) return o.slice(0, 200).map(function (x) { return cleanDeep(x, d + 1); });
    if (typeof o === 'object') { var r = {}; Object.keys(o).slice(0, 200).forEach(function (k) { r[k] = cleanDeep(o[k], d + 1); }); return r; }
    return null;
  }
  /** Almacén en memoria para VB.Career._useStore (el del invitado). */
  function memStore() {
    var m = {};
    return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }, _keys: function () { return Object.keys(m); } };
  }

  // ---- foto comprimida (gzip con CompressionStream si lo hay; si no, el JSON tal cual)
  function b64(u8) { var s = '', i; for (i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return root.btoa(s); }
  function unb64(s) { var b = root.atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function canGz(dir) { return !!((dir ? root.CompressionStream : root.DecompressionStream) && root.Blob && root.Response && root.btoa && root.atob); }
  function pack(json, gz) {
    if (!gz || !canGz(true)) return Promise.resolve({ z: '', d: json });
    try {
      var st = new root.Blob([json]).stream().pipeThrough(new root.CompressionStream('gzip'));
      return new root.Response(st).arrayBuffer().then(function (ab) { return { z: 'gz', d: b64(new Uint8Array(ab)) }; }, function () { return { z: '', d: json }; });
    } catch (e) { return Promise.resolve({ z: '', d: json }); }
  }
  function unpack(m) {
    if (!m || m.z !== 'gz') return Promise.resolve(String(m && m.d || ''));
    if (!canGz(false)) return Promise.reject(new Error('sin gzip'));
    try { return new root.Response(new root.Blob([unb64(String(m.d))]).stream().pipeThrough(new root.DecompressionStream('gzip'))).text(); }
    catch (e) { return Promise.reject(e); }
  }

  // ================================================================== estado de la conexión
  var S = { role: '', link: null, room: null, names: ['', ''], looks: [null, null], hi: null, ready: false, rev: 0, got: 0, lastJson: '',
    mem: null, note: '', match: null, timer: 0, needAt: 0, want: 0, prep: false, pending: false, code: '',
    hostW: '', stSent: '', down: null };   // (hostW: qué hace el anfitrión, visto por el invitado; stSent: lo último que se le dijo; down: aviso del corte)
  function lsGet(k) { try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (root.localStorage) root.localStorage.setItem(k, v); } catch (e) { } }
  function myId() {
    var R = VB.NetRoom, id = '';
    try { id = R && R.uid ? R.uid() : ''; } catch (e) { id = ''; }
    return String(id || lsGet('make-the-cut.devid') || lsGet('make-the-cut.device') || '').slice(0, 64);
  }
  function myName() { var N = VB.NetLobby; try { return N && N.myName ? N.myName() : 'Jugador'; } catch (e) { return 'Jugador'; } }
  function myLook() { var N = VB.NetLobby; try { return N && N.myLook ? N.myLook() : null; } catch (e) { return null; } }
  function settings() { return (VB.ctx && VB.ctx.settings) || {}; }
  function send(m) { var X = L(); if (!X || !X.send) return false; try { X.send(m); return true; } catch (e) { log('send', e); return false; } }
  function ui() { var U = VB.CareerUI; if (U && U.render) { try { U.render(); } catch (e) { } } if (U && U.syncMenu) { try { U.syncMenu(); } catch (e) { } } sheetSync(); }
  function linked() { return !!(S.role && S.link && S.link.state !== 'closed'); }
  function guestOn() { return S.role === 'guest'; }
  function hostOn() { return S.role === 'host'; }
  /** ¿Hay pareja conectada y presentada? (anfitrión: llegó su «hi»; invitado: ya tiene la Carrera) */
  function paired() { return hostOn() ? !!S.hi && linked() : guestOn() ? S.got > 0 && linked() : false; }

  function startTimer() {
    if (S.timer || typeof setInterval !== 'function') return;
    S.timer = setInterval(tick, 500);
  }
  function stopTimer() { if (S.timer) { clearInterval(S.timer); S.timer = 0; } }
  var lastPoll = 0;
  function tick() {
    var now = Date.now();
    if (S.match) { matchWatch(); return; }
    if (!S.role) { stopTimer(); return; }   // (invitado al que se le cortó en pleno partido: ya ha vuelto a su menú)
    if (hostOn() && S.hi) {
      if (now - lastPoll > POLL_MS) { lastPoll = now; sendSnap(false); }   // (la Carrera ha cambiado: foto nueva)
      var w = hostState(); if (w !== S.stSent && send({ t: 'st', w: w })) S.stSent = w;   // (solo al cambiar: «eligiendo», «jugando sin ti»…)
    }
    if (guestOn() && (S.got === 0 || S.want > S.got) && now - S.needAt > NEED_MS) { S.needAt = now; send({ t: 'need', rev: S.got }); }
  }
  /** Qué hace el anfitrión ahora (para la tarjeta del invitado): 'hub' = en la Carrera (eligiendo), 'solo' = jugando un partido sin
   *  su pareja (selección, Estrellas, pruebas… o un amistoso), 'menu' = fuera de la Carrera. */
  function hostState() {
    var st = VB.ctx && VB.ctx.state, U = VB.CareerUI;
    if (st === 'playing' || st === 'over') return 'solo';
    var o = false; try { o = !!(U && U.isOpen && U.isOpen()); } catch (e) { o = false; }
    return o ? 'hub' : 'menu';
  }
  function reset(why) {
    stopTimer();
    // (el invitado se va en pleno partido: el anfitrión sigue con la IA en su plaza y la jornada cuenta igual; matchDone llega con gameOver.
    //  Al invitado al que se le corta en pleno partido (o en la hoja final) se le guarda el partido: vuelve a su menú cuando lo deje)
    var was = S.role, keep = S.match && (was === 'host' ? !S.match.done : was === 'guest') ? S.match : null;
    if (was === 'guest' && VB.Career && VB.Career._useStore) { VB.Career._useStore(null); }   // (otra vez la Carrera propia, de localStorage)
    var hn = S.names[0];
    S.role = ''; S.link = null; S.room = null; S.names = ['', '']; S.looks = [null, null]; S.hi = null; S.ready = false; S.rev = 0; S.got = 0; S.want = 0;
    S.lastJson = ''; S.mem = null; S.match = null; S.pending = false; S.code = ''; S.hostW = ''; S.stSent = '';
    if (S.offMsg) { try { S.offMsg(); } catch (e) { } S.offMsg = null; }
    if (keep) { S.match = keep; startTimer(); }
    if (why && was) S.note = why === 'leave' ? 'Has salido del cooperativo.' : why === 'version' ? 'Tenéis versiones distintas del juego: actualizad los dos.' : 'Se ha cortado el cooperativo.';
    // invitado: pantalla «se ha cortado» (no si sale él) y de vuelta a SU menú (su Carrera, o el menú principal si no tiene)
    if (was === 'guest' && why && why !== 'leave') S.down = { why: why, host: hn || '', p2: p2Rec() };
    if (was === 'guest' && !keep) guestHome();
    ui();
  }
  /** La copia del jugador del invitado (make-the-cut.coop.p2) o null. */
  function p2Rec() { var r = null; try { r = JSON.parse(lsGet(P2_KEY) || 'null'); } catch (e) { r = null; } return r && r.p2 && typeof r.p2 === 'object' ? r : null; }
  function saveP2Rec(rec) {
    var prev = lsGet(P2_KEY), nr = JSON.stringify(rec);
    if (!prev || prev.replace(/"at":\d+,/, '') !== nr.replace(/"at":\d+,/, '')) lsSet(P2_KEY, nr);   // (solo la copia de su jugador: otra clave)
  }
  /** El invitado vuelve a lo suyo: con la Carrera abierta, a SU hub si tiene Carrera propia; si no, al menú principal. */
  function guestHome() {
    var U = VB.CareerUI, C = VB.Career; if (!U || !(U.isOpen && U.isOpen())) return;
    var st = VB.ctx && VB.ctx.state; if (st === 'playing' || st === 'over') return;
    var has = false; try { has = !!(C && C.get && C.get()); } catch (e) { has = false; }
    try { if (has) U.open('hub', { from: 'main' }); else U.close(); } catch (e) { log('guestHome', e); }
  }

  // ---- anfitrión
  /** Abre la sala cooperativa (desde la Carrera de playa con club). */
  function startHost() {
    var X = L(), Kb = KB(), c = Kb && Kb.load();
    if (!X) { S.note = 'El cooperativo aún no está disponible en esta versión.'; return false; }
    if (!c || isHall(c) || c.phase === 'pick' || !(c.myClub >= 0)) { S.note = 'Necesitas una Carrera de playa con club.'; return false; }
    if (S.role) return false;
    S.pending = true; S.note = '';
    try {
      if (X.host({ title: 'Carrera cooperativa', name: myName(), look: myLook(),
        onReady: function (info) { onReady('host', info); }, onClose: function (why) { reset(why || 'down'); } }) === false) { S.pending = false; return false; }
    } catch (e) { log('host', e); S.pending = false; S.note = 'No se ha podido abrir la sala.'; return false; }
    return true;
  }
  function onReady(role, info) {
    info = info || {};
    S.pending = false; S.role = role; S.link = info.link || null; S.room = info.room || null;
    S.names = [cleanName(info.names && info.names[0]) || 'Anfitrión', cleanName(info.names && info.names[1]) || 'Invitado'];
    S.looks = [info.looks && info.looks[0] || null, info.looks && info.looks[1] || null];
    var X = L(); if (S.offMsg) { try { S.offMsg(); } catch (e) { } } S.offMsg = X && X.onMessage ? X.onMessage(onMsg) : null;
    if (typeof S.offMsg !== 'function') S.offMsg = null;
    if (role === 'guest') {
      S.note = 'Conectado: esperando la Carrera de ' + S.names[0] + '…';
      var st = settings();
      send({ t: 'hi', id: myId(), name: myName(), num: guestNum(), ver: VB.VERSION || '', gz: canGz(false), aimSet: st.aimSet !== false, jsetAim: st.jsetAim === true });
      S.needAt = Date.now();
    } else S.note = '';
    startTimer(); ui();
  }
  /** Dorsal que pide el invitado: el de su copia de p2 si la tiene; si no, el de su Carrera; si no, ninguno. */
  function guestNum() {
    var r = null; try { r = JSON.parse(lsGet(P2_KEY) || 'null'); } catch (e) { r = null; }
    if (r && r.p2 && r.p2.num) return r.p2.num | 0;
    var Kb = KB(), c = null; try { c = Kb && Kb.load(); } catch (e) { c = null; }
    return c && c.player ? c.player.num | 0 : 0;
  }
  function onHi(m) {
    if ((m.ver || '') !== (VB.VERSION || '')) { send({ t: 'bye', why: 'version' }); var X = L(); setTimeout(function () { try { if (X) X.close(); } catch (e) { } reset('version'); }, 300); return; }
    var Kb = KB(), c = Kb.load(); if (!c) return;
    S.hi = { id: String(m.id || ''), name: cleanName(m.name) || S.names[1], gz: !!m.gz, aimSet: m.aimSet !== false, jsetAim: m.jsetAim === true };
    S.names[1] = S.hi.name;
    adopt(c, { id: S.hi.id || S.hi.name, name: S.hi.name, num: m.num }, Date.now());
    c.coop.lastSync = Date.now();
    Kb.save(c);
    S.ready = false; S.note = ''; S.stSent = '';
    sendSnap(true); ui();
  }
  /** Clave del partido que toca (temporada, fase, jornada, partidos apuntados y tipo): el «Listo» del invitado vale para ESE partido. */
  function fxKey(c) {
    var Kb = KB(), n = null; try { n = c && Kb.next ? Kb.next(c) : null; } catch (e) { n = null; }
    return c ? [c.season | 0, c.phase || '', c.week | 0, Array.isArray(c.notes) ? c.notes.length : 0, n ? n.kind || '' : ''].join('|') : '';
  }
  /** Anfitrión: el partido que toca ya no es aquel para el que el invitado pulsó «Listo» (simulado, partido en solitario…): su «Listo»
   *  ya no vale y se le dice (sin esto, el siguiente partido empezaba en cooperativo sin que confirmara, quizá lejos del aparato). */
  function readyCheck(c) {
    if (!S.ready || !c || S.readyKey === fxKey(c)) return false;
    S.ready = false; S.readyKey = ''; send({ t: 'rdy0' }); return true;
  }
  /** Manda la Carrera entera al invitado si ha cambiado (o siempre con force). Nunca en pleno partido (la sesión lee el enlace). */
  function sendSnap(force) {
    if (!hostOn() || !S.hi || S.match) return false;
    var Kb = KB(), c = Kb.load(); if (!c) return false;
    if (readyCheck(c)) ui();
    var json = JSON.stringify(c);
    if (!force && json === S.lastJson) return false;
    S.lastJson = json; var rev = ++S.rev;
    pack(json, S.hi.gz).then(function (p) { if (hostOn() && rev === S.rev && !S.match) send({ t: 'snap', rev: rev, z: p.z, d: p.d }); });
    return true;
  }
  function onMsg(m) {
    if (!m || typeof m !== 'object') return;
    try {
      if (hostOn()) {
        if (m.t === 'hi') onHi(m);
        else if (m.t === 'need') sendSnap(true);
        else if (m.t === 'int') { var Kb = KB(), c = Kb.load(); if (c && applyIntent(c, m)) { Kb.save(c); sendSnap(false); ui(); } }
        else if (m.t === 'ready') { S.ready = !!m.on; var cr = KB().load(); S.readyKey = S.ready && cr ? fxKey(cr) : ''; ui(); }
        else if (m.t === 'nack') {   // (el invitado no ha podido empezar: la IA lleva su plaza y p2 no se lleva la XP de la IA)
          S.ready = false; if (S.match && S.match.seat === 0 && !S.match.done) S.match.noP2 = true;
          S.note = (S.names[1] || 'Tu pareja') + ' no ha podido entrar en el partido: juega la IA en su sitio.'; ui();
        }
      } else if (guestOn()) {
        if (m.t === 'snap') onSnap(m);
        else if (m.t === 'play') onPlay(m);
        else if (m.t === 'st') { var w = ['hub', 'solo', 'menu'].indexOf(m.w) >= 0 ? m.w : ''; if (w !== S.hostW) { S.hostW = w; ui(); } }
        else if (m.t === 'sum') onSum(m);
        else if (m.t === 'rdy0') { if (S.ready) { S.ready = false; ui(); } }   // (el partido que toca ha cambiado: hay que volver a pulsar «Listo»)
        else if (m.t === 'bye') { var X = L(); try { if (X) X.close(); } catch (e) { } reset(m.why === 'version' ? 'version' : 'down'); }
      }
    } catch (e) { log('mensaje ' + m.t, e); }
  }

  // ---- invitado
  /** Entra con el código de la sala (o el del enlace ?coop=CODE). */
  function join(code) {
    var X = L(); code = normCode(code);
    if (!X) { S.note = 'El cooperativo aún no está disponible en esta versión.'; ui(); return false; }
    // (el mismo texto que el lobby, coopWhy('code'): los códigos nunca llevan 0, O, 1, I ni L)
    if (!CODE_RE.test(code)) { S.note = 'El código tiene 6 letras y cifras (sin 0, O, 1, I ni L).'; ui(); return false; }
    if (S.role) return false;
    S.pending = true; S.code = code; S.note = 'Buscando la sala ' + code + '…'; S.down = null;
    try {
      if (X.join({ code: code, name: myName(), look: myLook(),
        onReady: function (info) { onReady('guest', info); }, onClose: function (why) { reset(why || 'down'); } }) === false) { S.pending = false; S.note = ''; ui(); return false; }
    } catch (e) { log('join', e); S.pending = false; S.note = 'No se ha podido entrar.'; ui(); return false; }
    ui();
    return true;
  }
  /** P6 (netlobby.js) la llama si la página se abre con ?coop=CODE: abre la Carrera y entra. */
  function onJoinLink(code) {
    var go = function () {
      var U = VB.CareerUI; if (U && U.open && !(U.isOpen && U.isOpen())) { try { U.open(undefined, { from: 'main' }); } catch (e) { } }
      join(code);
    };
    if (typeof setTimeout === 'function') setTimeout(go, 0); else go();
    return true;
  }
  function onSnap(m) {
    var rev = m.rev | 0; if (rev <= S.got) return;
    unpack(m).then(function (json) {
      if (!guestOn() || rev <= S.got) return;
      var c = JSON.parse(json); if (!c || !c.coop || !c.coop.p2 || !c.player) return;
      installGuest(c);
      S.got = rev; if (S.want <= rev) S.want = 0;
      if (S.note && S.note.indexOf('Conectado') === 0) S.note = '';
      ui();
    }, function (e) { log('foto', e); });
  }
  /** Resumen de la jornada del invitado (llega tras matchDone del anfitrión, con la hoja final a la vista): se guarda para pintarlo
   *  (matchWatch) y la copia de su p2 se pone al día ya (si el enlace se corta antes de la foto, su progreso no se pierde). */
  function onSum(m) {
    var d = cleanDeep({ sum: m.sum, cs: m.cs, x: m.x, rec: m.rec });
    if (!d || !d.sum || typeof d.sum !== 'object' || !d.cs || typeof d.cs !== 'object') return;
    var r = d.rec;
    if (r && r.p2 && typeof r.p2 === 'object' && r.p2.st) saveP2Rec({ cid: r.cid >>> 0, host: cleanName(r.host), club: String(r.club || '').slice(0, 60), season: r.season | 0, at: Date.now(), p2: r.p2 });
    if (S.match && S.match.seat === 1) { S.match.gsum = { sum: d.sum, cs: d.cs, x: d.x && typeof d.x === 'object' ? d.x : null }; matchWatch(); }
  }
  /** Pone la Carrera del anfitrión c en el almacén en memoria (vista del invitado) y apunta su copia de p2 en el aparato. */
  function installGuest(c) {
    var first = !S.mem;
    if (first) S.mem = memStore();
    S.mem.setItem(CKEY, JSON.stringify(guestView(c)));
    S.mem.setItem(MKEY, 'beach');
    var C = VB.Career;
    if (first) C._useStore(S.mem); else C._reset();
    var k = KB() && KB().myClub ? KB().myClub(c) : null;
    saveP2Rec({ cid: c.seed >>> 0, host: c.player.name, club: k ? k.name : '', season: c.season | 0, at: Date.now(), p2: c.coop.p2 });
    S.down = null;
    var U = VB.CareerUI;
    // (1ª foto: al hub aunque la Carrera ya esté abierta: quien no tiene Carrera propia estaba en «crear», sin tarjeta ni «Listo»)
    if (first && U && U.open && !S.match && (!VB.ctx || VB.ctx.state !== 'playing')) { try { U.open('hub', { from: 'main' }); } catch (e) { } }
  }
  function onPlay(m) {
    var A = VB.ctx && VB.ctx.actions; if (!A || !A.startCoopCareerMatch) return;
    var H = Array.isArray(m.humans) && m.humans.length === 2 ? m.humans.map(function (h, i) { return { idx: i, name: cleanName(h && h.name) || S.names[i], look: h && h.look || null }; }) : null;
    if (!H) return;
    S.ready = false;
    // (sin la Carrera aún —foto en camino— no hay partido: se le dice al anfitrión, que juega con la IA en mi plaza sin darme XP)
    if (!paired()) { send({ t: 'nack' }); S.note = 'Aún no tenías la Carrera de ' + (S.names[0] || 'tu pareja') + ': este partido lo juega la IA en tu sitio.'; ui(); return; }
    var U = VB.CareerUI; if (U && U.isOpen && U.isOpen() && U.close) { try { U.close(); } catch (e) { } }
    if (!A.startCoopCareerMatch({ seat: 1, humans: H })) { send({ t: 'nack' }); S.note = 'No se ha podido empezar el partido.'; ui(); }
  }
  /** Puerta de career-ui para el invitado (al principio de onClick): 'pass' = sigue como siempre (mirar, o gastar SUS puntos e
   *  insignias en la copia en memoria, que además se piden al anfitrión), false = no se puede. */
  function intent(act, b) {
    if (!guestOn()) return 'pass';
    if (!act || act.indexOf('co-') === 0 || GUEST_OK.indexOf(act) >= 0) return 'pass';
    if (act === 'up') { send({ t: 'int', a: 'up', k: b && b.getAttribute ? b.getAttribute('data-k') : '' }); return 'pass'; }
    if (act === 'badge') { send({ t: 'int', a: 'badge', k: b && b.getAttribute ? b.getAttribute('data-id') : '' }); return 'pass'; }
    S.note = 'Eso lo decide ' + (S.names[0] || 'el anfitrión') + ': tú puedes gastar tus puntos e insignias y pulsar «Listo».';
    return false;
  }
  function setReady(on) { if (!guestOn() || !paired()) return false; S.ready = !!on; send({ t: 'ready', on: S.ready }); return true; }
  function leave() { var X = L(); if (X && X.close) { try { X.close(); } catch (e) { } } reset(S.role ? 'leave' : ''); return true; }

  // ================================================================== partido (anfitrión y main.js)
  /** career-ui play() (anfitrión): null = el partido de siempre (sin pareja o no es de liga ni del Open); {wait} = falta su «Listo»;
   *  {go} = función que lo empieza en cooperativo (career-ui cierra el hub antes). */
  function hostPlay() {
    if (!hostOn() || !paired()) return null;
    // (la Carrera de pista en pantalla: su partido va como siempre; el cooperativo es de la de playa)
    var CM = VB.Career; if (CM && CM.mode && CM.mode() !== 'beach') return null;
    var Kb = KB(), c = Kb.load(), n = c ? Kb.next(c) : null;
    if (!n || n.bench || KINDS.indexOf(n.kind) < 0) { S.note = 'Este partido lo juegas tú solo con tu compañero de la IA.'; return null; }
    readyCheck(c);
    if (!S.ready) { S.note = 'Esperando a que ' + S.names[1] + ' pulse «Listo».'; return { wait: true }; }
    return { go: startMatch };
  }
  function startMatch() {
    var A = VB.ctx && VB.ctx.actions; if (!A || !A.startCoopCareerMatch || !hostOn()) return false;
    var mo = matchOpts(); if (!mo) { S.note = 'No hay partido que jugar.'; ui(); return false; }
    S.nextOpts = mo;
    send({ t: 'play', humans: mo.humans.map(function (h) { return { name: h.name, look: h.look }; }) });
    var ok = A.startCoopCareerMatch({ seat: 0 });
    if (!ok) { S.nextOpts = null; S.note = 'No se ha podido empezar el partido.'; ui(); }
    return ok;
  }
  function seed() {
    try { if (root.crypto && root.crypto.getRandomValues) return root.crypto.getRandomValues(new Uint32Array(1))[0] >>> 1; } catch (e) { }
    return Math.floor(Math.random() * 2147483647);
  }
  /** Look con la equipación del club (las dos plazas visten la del club del anfitrión). */
  function withKit(lk, kit) { var o = lk && typeof lk === 'object' ? copy(lk) : {}; if (kit) o.kit = { kitShirt: kit.kitShirt, kitAccent: kit.kitAccent, kitShorts: kit.kitShorts, kitPattern: kit.kitPattern }; return o; }
  /** Opciones del partido cooperativo (anfitrión) a partir de matchSetup con p2 (gancho 'setup' con S.prep): {opts (Sim.createGame
   *  online), humans (startOnline: nombre y look de cada plaza), cs (g.career para la Carrera), n}. o = {seed, c} (pruebas). */
  function matchOpts(o) {
    o = o || {};
    var Kb = KB(), c = o.c || Kb.load(); if (!c || isHall(c) || !c.coop || !c.coop.p2) return null;
    var n = Kb.next(c); if (!n || n.bench || KINDS.indexOf(n.kind) < 0) return null;
    var m = null; S.prep = true;
    try { m = Kb.matchSetup(c); } catch (e) { log('matchSetup', e); m = null; } finally { S.prep = false; }
    if (!m || !m.career || !m.career.coop) return null;
    var st = settings(), hi = S.hi || {}, vid = '';
    try { vid = VB.Venues && VB.Venues.forMatch ? VB.Venues.forMatch(n, 'beach') || '' : ''; } catch (e) { vid = ''; }
    var cs = copy(m.career);
    var opts = { online: true, coop: true, seed: o.seed != null ? o.seed >>> 0 : seed(), venue: 'beach', mapId: vid, bestOf: 3, points: m.points, ref: m.ref || undefined,
      present: true, stats: true, djump: true, timeouts: false,
      attrs: m.attrs, badges: m.badges || null,
      nums: [[cs.num | 0 || null, cs.mateNum | 0 || null], null],
      teamLv: [{ prof: 'mate', tm: m.difficulty, rookie: !!m.rookie }, { prof: m.difficulty, rookie: !!m.rookie }],
      humans: [{ idx: 0, aimSet: st.aimSet !== false, jsetAim: st.jsetAim === true }, { idx: 1, aimSet: hi.aimSet !== false, jsetAim: hi.jsetAim === true }] };
    var humans = [{ idx: 0, name: S.names[0] || cs.player || 'Anfitrión', look: withKit(S.looks[0] || myLook(), m.kit) },
      { idx: 1, name: S.names[1] || c.coop.p2.name, look: withKit(S.looks[1], m.kit) }];
    return { opts: JSON.parse(JSON.stringify(opts)), humans: humans, cs: cs, n: n };
  }
  /** Enlace para la sesión del partido: la fachada del lobby tal cual (su close(), el de netStop al acabar, la devuelve al lobby). */
  function matchLink() { return S.link && paired() ? S.link : null; }
  /** main.js startCoopCareerMatch, ya con la sesión en marcha (net = ctx.net, o null si no ha podido empezar). */
  function matchStarted(seat, net, mo) {
    if (!net || !net.sess) { S.nextOpts = null; return; }
    mo = mo || S.nextOpts; S.nextOpts = null;
    net.coopCareer = true;   // (P4/P6: sin revancha en el partido de Carrera cooperativa)
    S.match = { seat: seat, net: net, sess: null, cs: mo ? mo.cs : null, gc: null, gw: null, done: seat !== 0 || !mo, rev0: S.got };
    S.ready = false;
    wrapSess(net.sess);
    startTimer();
  }
  function wrapSess(s) {
    if (!s || s._coopW) return;
    s._coopW = true; S.match.sess = s;
    var adv = s.advance;
    s.advance = function () { var r = adv.apply(s, arguments); try { onAdvance(s, r); } catch (e) { log('advance', e); } return r; };
  }
  /** Cada avance de la sesión: los eventos CONFIRMADOS a la Carrera del anfitrión (ingest) y, con gameOver, matchDone (solo él). */
  function onAdvance(s, r) {
    var mt = S.match; if (!mt || mt.done || mt.sess !== s || !r || !r.confirmed || !r.confirmed.length) return;
    feed(mt, s.confirmedGame(), r.confirmed);
  }
  /** Eventos confirmados evs de la partida canónica gc → VB.Career (con g.career = cs sobre una vista de gc: la sim no lleva career). */
  function feed(mt, gc, evs) {
    var C = VB.Career, BG = VB.Badges; if (!gc || !C) return null;
    if (gc !== mt.gc) {   // (partida nueva o reemplazada por una vuelta: la vista nueva y la estadística sigue en el mismo M)
      var gw = Object.create(gc), gw0 = mt.gw; gw.career = mt.cs; var M0 = C.beach._M();
      if (M0 && gw0 && M0.g === gw0) M0.g = gw;
      // (y el contador de insignias también sigue: VB.Badges empieza de cero si cambia la partida)
      try { var cu0 = BG && BG._cur ? BG._cur() : null; if (cu0 && gw0 && cu0.g === gw0) cu0.g = gw; } catch (eb) { }
      mt.gc = gc; mt.gw = gw;
    }
    try { C.ingest(evs, mt.gw); } catch (e) { log('ingest', e); }
    // insignias del anfitrión y de p2 con lo CONFIRMADO (ui.js no las cuenta en el cooperativo): un punto anulado por el challenge,
    // como en ui.js (_ovr en el 'point' del mismo lote que el challengeResult anulado; copia: el evento es de la sesión)
    // («Sangre fría» mira g.setPoint / g.matchPoint al sacar: lo confirmado llega con unos tics de retraso y gc ya va por delante (el
    //  punto que da la bola de partido haría «clutch» el saque anterior). Mientras cuenta, la vista lleva los del último serveReady
    //  confirmado, que son los del momento del saque; luego se quitan y la vista vuelve a leer los de gc)
    if (BG && BG.ingest && !mt.done) {
      var ovr = false, j, gv = mt.gw, sp = mt.sp || (mt.sp = [-1, -1]);
      for (j = 0; j < evs.length; j++) if (evs[j] && evs[j].type === 'challengeResult' && evs[j].overturned) ovr = true;
      for (j = 0; j < evs.length; j++) {
        var ev = evs[j]; if (!ev || ev.amb) continue;
        if (ev.type === 'serveReady') { sp[0] = num(ev.setPoint) ? ev.setPoint : -1; sp[1] = num(ev.matchPoint) ? ev.matchPoint : -1; }
        gv.setPoint = sp[0]; gv.matchPoint = sp[1];
        try { BG.ingest(ovr && ev.type === 'point' ? Object.assign({}, ev, { _ovr: true }) : ev, gv); } catch (eb2) { log('Badges.ingest', eb2); }
      }
      delete gv.setPoint; delete gv.matchPoint;
    }
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i]; if (!e || e.type !== 'gameOver' || mt.done) continue;
      mt.done = true;
      try { mt.sum = C.matchDone({ sets: [e.sets[0], e.sets[1]], setScores: e.setScores || gc.setScores, win: e.team === 0 }, null, mt.gw); } catch (er) { log('matchDone', er); }
      if (mt.sum) afterDone(mt);
    }
    return mt.sum || null;
  }
  /** Tras matchDone (anfitrión): los datos de su Resumen (tabla y barra) y el Resumen de su pareja, que viaja ya (la hoja final). */
  function afterDone(mt) {
    var Kb = KB(), c = null; try { c = Kb.load(); } catch (e) { c = null; } if (!c) return;
    mt.x = endX(c, c.player);
    if (mt.noP2 || !mt.sum.coop) return;
    var gs = null; try { gs = guestSum(c, mt.sum, mt.cs); } catch (e) { log('guestSum', e); }
    mt.gsum = gs;
    if (gs && hostOn()) send(gs);
  }
  /** El partido ha terminado cuando main.js suelta la sesión (ctx.net otro o null): el enlace ha vuelto al lobby y la foto viaja. */
  function matchWatch() {
    var mt = S.match; if (!mt) return;
    var net = VB.ctx ? VB.ctx.net : null;
    if (net === mt.net && net && net.sess !== mt.sess && net.sess) { mt.done = true; wrapSessFriendly(net.sess); }   // (revancha: amistoso)
    if (net === mt.net && net) {
      // hoja final a la vista: el Resumen de la jornada (el del anfitrión con su g.career; el del invitado, el que le ha mandado)
      if (!mt.shown && VB.ctx.state === 'over') { var R = mt.seat === 0 ? (mt.sum ? { sum: mt.sum, cs: mt.cs, x: mt.x } : null) : mt.gsum; if (R) { mt.shown = true; showSum(R); } }
      return;
    }
    S.match = null; S.stSent = '';
    if (hostOn()) { S.lastJson = ''; sendSnap(true); }
    else if (guestOn()) { S.want = mt.rev0 + 1; S.needAt = 0; }
    var U = VB.CareerUI, st = VB.ctx && VB.ctx.state;
    if ((S.role || mt.seat === 0) && U && U.open && !(U.isOpen && U.isOpen()) && st !== 'playing') { try { U.open('hub', { fresh: hostOn(), from: 'main' }); } catch (e) { } }
    if (!S.role && mt.seat === 1) { stopTimer(); guestHome(); }   // (al invitado se le cortó en pleno partido: a lo suyo)
    ui();
  }
  /** Pinta el Resumen de la jornada en la hoja final online (VB.UI.endCareer; main.js solo lo hace con g.career, que la vista online
   *  no lleva): R = {sum, cs (g.career), x (tabla, barra…)}. La hoja sigue siendo la online (botón «Volver a la Carrera»). */
  function showSum(R) {
    var U = VB.UI, g = VB.ctx && VB.ctx.game; if (!U || !U.endCareer || !g || !R || !R.sum) return false;
    var gv = Object.create(g); gv.career = R.cs || {};
    try { U.endCareer(R.sum, gv, R.x || null); return true; } catch (e) { log('endCareer', e); return false; }
  }
  function wrapSessFriendly(s) { if (s && !s._coopW) { s._coopW = true; S.match.sess = s; } }

  // ================================================================== extensión de la Carrera
  var EXT = {
    id: 'coop',
    hook: function (c, kind, a) {
      if (!c || !c.coop) return;   // (sin c.coop no hace nada: la Carrera es idéntica)
      if (kind === 'setup' && S.prep && !isHall(c)) applySetup(c, a);
      else if (kind === 'match' && a && c.coop.pend) { a.coop = c.coop.pend; delete c.coop.pend; }
    },
    /** career.js matchDone (beach) con g.career.coop: los números de la pareja humana (m.p[1]). */
    coopMatch: function (c, m, res, rallies) { if (c && !isHall(c) && !(S.match && S.match.noP2)) creditMate(c, m, res, rallies); }
  };
  (VB.CareerExt = VB.CareerExt || []).push(EXT);

  // ================================================================== interfaz (VB.CareerUIExt: tarjeta en Partido y fila al crear)
  function btn(H, act, label, tone, extra) { return '<button class="sp-btn sp-md ' + (tone || 'sp-cream') + '" data-act="' + act + '"' + (extra || '') + '><span class="sp-l"><span class="sp-t">' + esc(label) + '</span></span></button>'; }
  function spH(H, a, k) { return H && H.sp ? H.sp(a, k) : a.join(' · '); }
  function noteP() { return S.note ? '<p class="coo-note" role="status">' + esc(S.note) + '</p>' : ''; }
  function joinRow(H) {
    return '<div class="coo-join"><label for="coCode">Código</label><input id="coCode" class="coo-code" maxlength="6" autocomplete="off" spellcheck="false" autocapitalize="characters" inputmode="text" placeholder="ABC234" value="' + esc(S.code) + '">' +
      btn(H, 'co-join', 'Unirse', 'sp-cream') + '</div>';
  }
  /** Qué pasa ahora, visto por el invitado (la línea grande de su tarjeta). */
  function statusTxt(c, hn) {
    if (S.hostW === 'solo') return hn + ' está jugando un partido sin ti. Espera a que acabe.';
    if (S.hostW === 'menu') return hn + ' ha salido de la Carrera un momento. Espera a que vuelva.';
    if (c.phase === 'off') return hn + ' está cerrando la temporada.';
    var n = null; try { n = KB() && KB().next ? KB().next(c) : null; } catch (e) { n = null; }
    if (n && (n.bench || KINDS.indexOf(n.kind) < 0)) return 'El próximo partido (' + String(n.label || '').split(' · ').join(', ') + ') lo juega ' + hn + ' sin ti.';
    return S.ready ? 'Estás listo. Empezáis cuando ' + hn + ' pulse «Jugar partido».' : hn + ' está eligiendo. Pulsa «Listo» y empezáis cuando pulse «Jugar partido».';
  }
  /** Tarjeta del invitado, arriba del todo en Partido (hueco matchTop): qué hace el anfitrión, su jugador, «Listo», «Tu jugador», «Salir». */
  function guestCard(c, H) {
    if (!guestOn() || !c || !c.player) return '';
    var h = '<div class="card coo-card coo-g" id="crCoop"><h3>' + spH(H, ['Cooperativo', 'Invitado'], 'd') + '</h3>';
    if (!paired()) {   // (aún sin la Carrera del anfitrión: nada que marcar como «Listo»; la hoja #coSheet lo dice encima)
      return h + '<p>' + esc('Conectado: esperando la Carrera de ' + (S.names[0] || 'tu pareja') + '…') + '</p><div class="acts">' + btn(H, 'co-end', 'Salir', 'sp-cream') + '</div>' + noteP() + '</div>';
    }
    var o = c.coop || {}, hn = (o.host && o.host.name) || S.names[0] || 'tu pareja', me = c.player, pts = me.pts | 0;
    h += '<p class="coo-st" role="status">' + esc(statusTxt(c, hn)) + '</p>' +
      '<p class="coo-me">' + esc('Tú: ' + (me.name || '') + ', n.º ' + (me.num | 0) + ', nivel ' + (me.lvl | 0) + (pts > 0 ? ' · ' + pts + (pts === 1 ? ' punto' : ' puntos') + ' para gastar' : '')) + '</p>' +
      '<p class="muted">' + esc('Gastas tus puntos e insignias; lo demás lo decide ' + hn + '.') + '</p>' +
      '<div class="acts">' + btn(H, 'co-ready', S.ready ? 'Listo ✓' : 'Listo', S.ready ? 'sp-kit' : 'sp-cream', ' aria-pressed="' + S.ready + '"') + btn(H, 'co-me', 'Tu jugador', 'sp-cream') + btn(H, 'co-end', 'Salir', 'sp-cream') + '</div>';
    return h + noteP() + '</div>';
  }
  /** Tu jugador del cooperativo guardado en este aparato (fuera del cooperativo): una línea, o ''. */
  function recLine() {
    var r = p2Rec(); if (!r) return '';
    return '<p class="coo-me">' + esc('Tu jugador en la Carrera de ' + (cleanName(r.host) || 'tu pareja') + ': ' + (cleanName(r.p2.name) || 'Pareja') + ', n.º ' + (r.p2.num | 0) + ', nivel ' + (r.p2.lvl | 0) + '.') + '</p>';
  }
  function card(c, H) {
    if (!c || !c.player || guestOn()) return '';   // (el invitado: guestCard, arriba)
    var h = '<div class="card coo-card" id="crCoop"><h3>' + spH(H, ['Cooperativo', hostOn() ? 'Anfitrión' : 'Online'], 'd') + '</h3>';
    if (isHall(c) && hostOn()) return h + '<p>' + esc('Cooperativo abierto con ' + (S.names[1] || 'tu pareja') + ' en tu Carrera de playa: cambia a la playa para jugar juntos. Aquí, en la pista, juegas tú solo.') + '</p>' +
      '<div class="acts">' + btn(H, 'co-end', 'Terminar el cooperativo', 'sp-cream') + '</div>' + noteP() + '</div>';
    if (isHall(c)) return h + '<p class="muted">Pronto: la Carrera de pista en cooperativo. De momento, el cooperativo es de la Carrera de playa.</p>' + (S.role ? '' : joinRow(H)) + noteP() + '</div>';
    if (hostOn()) {
      var nm = S.names[1] || 'tu pareja';
      if (!S.hi) h += '<p>' + esc('Conectado con ' + nm + '…') + '</p>';
      else h += '<p>' + esc(nm + ' juega como tu pareja (dorsal ' + (c.coop && c.coop.p2 ? c.coop.p2.num | 0 : 0) + ', nivel ' + (c.coop && c.coop.p2 ? c.coop.p2.lvl | 0 : 1) + '). ' + (S.ready ? 'Está listo.' : 'Aún no ha pulsado «Listo».')) + '</p>' +
        '<p class="muted">Solo los partidos de liga y del Open se juegan juntos; los demás, tú solo.</p>';
      return h + '<div class="acts">' + btn(H, 'co-end', 'Terminar el cooperativo', 'sp-cream') + '</div>' + noteP() + '</div>';
    }
    var can = c.phase !== 'pick' && c.myClub >= 0, X = L();
    h += '<p class="muted">Juega la liga y el Open con otra persona como pareja, cada uno en su aparato.</p>' + recLine() +
      '<div class="acts">' + (can ? btn(H, 'co-host', S.pending ? 'Abriendo…' : 'Jugar en cooperativo', 'sp-kit', X && !S.pending ? '' : ' disabled') : '') + '</div>' + joinRow(H);
    return h + noteP() + '</div>';
  }
  function createRow(form, hall, H) {
    if (guestOn()) return '';
    return '<div class="coo-create"><label for="coCode">¿Te han invitado a un cooperativo?</label>' + recLine() + joinRow(H).replace('<label for="coCode">Código</label>', '') + noteP() + '</div>';
  }
  function act(a, b) {
    if (a === 'co-host') { startHost(); return { render: true, focus: '#crCoop button' }; }
    if (a === 'co-join') {
      var inp = null; try { inp = b && b.closest ? (b.closest('.coo-join') || document).querySelector('#coCode') : document.getElementById('coCode'); } catch (e) { inp = null; }
      join(inp ? inp.value : S.code); return { render: true, focus: '#crCoop button, #coCode' };
    }
    if (a === 'co-ready') { setReady(!S.ready); return { render: true, focus: '[data-act="co-ready"]' }; }
    if (a === 'co-me') return { tab: 'player' };   // (el invitado: su ficha, su nivel y sus puntos)
    if (a === 'co-end') { leave(); return { render: true }; }
    return null;
  }

  // ---- hoja SPLAT del invitado (#coSheet): «esperando la Carrera» y «se ha cortado» (encima de todo; nunca en pleno partido)
  function sheetWant() {
    var st = VB.ctx && VB.ctx.state; if (st === 'playing' || st === 'over') return null;
    if (guestOn() && !paired() && !S.match) {
      var hn = S.names[0] || 'tu pareja';
      return { k: 'wait', title: 'Carrera cooperativa', text: 'Conectado con ' + hn + '. Esperando a que llegue su Carrera…',
        sub: 'Vas a jugar como su pareja. Tu jugador se guarda en este aparato.', ctas: [['end', 'Salir', 'sp-danger']] };
    }
    if (S.down && !S.role) {
      var d = S.down, r = d.p2, hd = cleanName(d.host) || (r && cleanName(r.host)) || 'tu pareja';
      return { k: 'down', title: 'Carrera cooperativa', bad: true,
        text: d.why === 'version' ? 'Tenéis versiones distintas del juego: actualizad los dos.' : 'Se ha cortado el cooperativo con ' + hd + '.',
        sub: r ? 'Tu jugador (' + (cleanName(r.p2.name) || 'Pareja') + ', nivel ' + (r.p2.lvl | 0) + ') queda guardado en este aparato: cuando vuelvas a entrar en la Carrera de ' + hd + ', sigue donde lo dejaste.' : '',
        ctas: [['ok', 'Entendido', 'sp-gold']] };
    }
    return null;
  }
  function sheetCss() {
    if (document.getElementById('coSheetCss')) return;
    var P = ':root:not(#_):not(#_) ', s = document.createElement('style'); s.id = 'coSheetCss';
    s.textContent = ['/* ---- career-coop: hoja del invitado ---- */',
      '#coSheet{position:fixed;inset:0;z-index:1190;display:flex;align-items:center;justify-content:center;padding:max(12px,env(safe-area-inset-top)) 16px max(12px,env(safe-area-inset-bottom));box-sizing:border-box;background:rgba(10,8,24,.6)}',
      '#coSheet[hidden]{display:none}',
      '#coSheet .cs-card{display:flex;flex-direction:column;gap:10px;width:min(100%,500px);max-height:100%;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;padding:16px 18px 18px}',
      '#coSheet h3{margin:0;font:400 clamp(18px,3.4vw + 6px,26px)/1.1 var(--sp-pop,sans-serif);letter-spacing:.01em;text-transform:uppercase;color:var(--sp-gold,#ffd23f);text-shadow:2px 2px 0 var(--sp-ink,#15102a);transform:rotate(-1.5deg);transform-origin:0 50%}',
      '#coSheet .cs-t{margin:0;font:700 clamp(15px,1vw + 12px,17px)/1.35 var(--sp-ui,sans-serif);color:rgba(255,244,220,.96)}#coSheet .cs-t.bad{color:#ffb3bc}',
      '#coSheet .cs-s{margin:0;font:600 clamp(13px,1vw + 10px,15px)/1.4 var(--sp-ui,sans-serif);color:rgba(255,244,220,.84)}',
      '.cs-under,.cs-under *{pointer-events:none!important}',
      '#coSheet .cs-bar{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:12px 14px;margin-top:4px}',
      P + '#coSheet .cs-bar .sp-btn{--sp-h:50px;--sp-fs:16px;--sp-px:20px;flex:0 1 auto;width:auto;min-width:0}'].join('\n');
    document.head.appendChild(s);
  }
  /** La hoja es modal (aria-modal): lo de debajo queda inert y sin toques mientras se ve (como #olCoop de netlobby.js). No se tocan los
   *  avisos (aria-live, #spToasts) ni lo que ya estaba oculto o inert. */
  var under = [];
  function sheetUnder(on) {
    under.forEach(function (e) { e.removeAttribute('inert'); e.classList.remove('cs-under'); }); under = [];
    if (!on || typeof document === 'undefined' || !document.body) return;
    var ch = document.body.children || [];
    for (var i = 0; i < ch.length; i++) {
      var e = ch[i];
      if (!e || e.id === 'coSheet' || /^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(e.tagName) || e.hidden || e.hasAttribute('inert') || e.hasAttribute('aria-live') || e.id === 'spToasts' || (e.querySelector && e.querySelector('#spToasts'))) continue;
      e.setAttribute('inert', ''); e.classList.add('cs-under'); under.push(e);
    }
  }
  function sheetSync() {
    if (typeof document === 'undefined' || !document.body) return;
    var w = sheetWant(), d = document.getElementById('coSheet');
    if (!w) { if (d && !d.hidden) { d.hidden = true; d.innerHTML = ''; d.removeAttribute('data-k'); } sheetUnder(false); return; }
    sheetCss();
    if (!d) {
      d = document.createElement('div'); d.id = 'coSheet'; d.hidden = true;
      d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Carrera cooperativa');
      d.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-cs]') : null; if (!b) return;
        var a = b.getAttribute('data-cs'); try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui(a === 'end' ? 'back' : 'click'); } catch (e) { }
        if (a === 'end') leave();
        else if (a === 'ok') { S.down = null; S.note = ''; sheetSync(); guestHome(); ui(); }
      });
      document.body.appendChild(d);
    }
    var key = JSON.stringify(w); if (d.getAttribute('data-k') === key && !d.hidden) return;
    d.setAttribute('data-k', key);
    d.innerHTML = '<div class="cs-card sp-panel"><h3>' + esc(w.title) + '</h3><p class="cs-t' + (w.bad ? ' bad' : '') + '" role="status">' + esc(w.text) + '</p>' +
      (w.sub ? '<p class="cs-s">' + esc(w.sub) + '</p>' : '') +
      '<div class="cs-bar">' + w.ctas.map(function (x, i) { return '<button type="button" class="sp-btn sp-md ' + x[2] + '" data-shape="' + i + '" data-cs="' + x[0] + '"><span class="sp-t">' + esc(x[1]) + '</span></button>'; }).join('') + '</div></div>';
    d.hidden = false; sheetUnder(true);
    if (VB.Splat && VB.Splat.decorate) { try { VB.Splat.decorate(d); } catch (e) { } }
    setTimeout(function () { var b = d.querySelector('[data-cs]'); if (b && !d.hidden) { try { b.focus({ preventScroll: true }); } catch (e) { } } }, 30);
  }
  function css() {
    var Q = ':root:not(#_):not(#_):not(#_) #career';
    return ['/* ---- career-coop: Carrera cooperativa ---- */',
      Q + ' .coo-join{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0 0}',
      Q + ' .coo-join label{font-weight:700;font-size:max(12px,.85em)}',
      Q + ' .coo-code{width:8.5em;min-height:44px;font:700 16px var(--ui,sans-serif);letter-spacing:.12em;text-transform:uppercase;text-align:center}',
      Q + ' .coo-note{margin:8px 0 0;font-weight:700;font-size:max(12px,.9em)}',
      Q + ' .coo-create{display:flex;flex-direction:column;gap:6px}',
      Q + ' .coo-st{margin:4px 0 6px;font-weight:800;font-size:max(14px,1.02em);line-height:1.35}',
      Q + ' .coo-me{margin:4px 0;font-weight:700;font-size:max(13px,.95em)}',
      Q + ' .coo-g .acts{flex-wrap:wrap}',
      // invitado: lo que no puede tocar, apagado (la puerta de onClick lo para y lo explica)
      Q + '.cr-coopg button[data-act]:not([data-act^="co-"]):not([data-act="up"]):not([data-act="badge"]):not([data-act="close"]):not([data-act="hub"]):not([data-act="lvl"]):not([data-act="lg6"]):not([data-act="lgsheet"]):not([data-act="est"]):not([data-act^="st-"]){opacity:.45;filter:saturate(.4)}'
    ].join('\n');
  }
  (VB.CareerUIExt = VB.CareerUIExt || []).push({ id: 'coop', prefix: 'co-', ui: { matchTop: guestCard, match: card }, createRow: createRow, act: act, css: css });

  /** tools/mobaudit.js (filas carrera-coop-*): deja una pantalla del cooperativo de muestra en la página, sin red. kind: 'host'
   *  (anfitrión con pareja presentada y lista), 'guest' (invitado con la Carrera; el anfitrión eligiendo), 'solo' (el anfitrión juega
   *  sin él), 'wait' (esperando la Carrera), 'down' (se ha cortado: de vuelta a su Carrera, con la hoja), 'sum' (Resumen de la jornada
   *  del invitado sobre la hoja final de muestra, ?debug=recap&career=1). Con una Carrera de playa con club guardada (salvo 'sum'). */
  function demo(kind) {
    var fake = { state: 'open', send: function () { }, poll: function () { return []; } }, mate = { id: 'demo', name: 'Noa Ferrer', num: 11 };
    if (kind === 'sum') {
      var g = VB.ctx && VB.ctx.game; if (!g || !g.career || !g.sets) return false;
      var cs = copy(g.career), hn = cs.player || 'Anfitriona', hnum = cs.num | 0, BL = VB.Badges && VB.Badges.BY && VB.Badges.BY.canon;
      cs.player = mate.name; cs.num = cs.mateNum | 0 || mate.num; cs.mate = hn; cs.mateNum = hnum;
      var win = g.sets[0] > g.sets[1];
      var s = { label: cs.label || '', phase: 'league', season: 1, win: win, sets: g.sets.slice(), setScores: (g.setScores || []).map(function (x) { return x.slice(); }),
        nota: 7.4, xp: 212, lvlUp: 1, lvl: 4, ptsGained: 3, me: { nota: 7.4, kills: 6, aces: 2, blocks: 1, assists: 3, digs: 5, errors: 2 },
        badges: BL ? [{ slot: 0, num: cs.num, id: 'canon', name: BL.name, lvl: 1, prev: 0, tier: 'bronce', eq: true }] : [], round: [] };
      return showSum({ sum: s, cs: cs, x: null });
    }
    reset(''); S.note = ''; S.down = null;   // (antes de leer la Carrera: una muestra anterior de invitado dejaba la de memoria)
    var Kb = KB(), c = null; try { c = Kb && Kb.load(); } catch (e) { c = null; }
    if (!c || isHall(c) || !(c.myClub >= 0)) return false;
    if (kind === 'host') {
      adopt(c, mate, 1); Kb.save(c);
      S.role = 'host'; S.link = fake; S.names = [c.player.name, mate.name]; S.hi = { id: mate.id, name: mate.name, gz: false, aimSet: true, jsetAim: false }; S.ready = true; S.stSent = 'hub';
      ui(); return true;
    }
    if (['guest', 'solo', 'wait', 'down'].indexOf(kind) < 0) return false;
    var hc = copy(c); adopt(hc, mate, 1); hc.coop.p2.pts = 3; hc.coop.p2.lvl = 3;
    S.role = 'guest'; S.link = fake; S.names = [c.player.name, mate.name];
    if (kind === 'wait') { ui(); return true; }
    installGuest(hc); S.got = 1; S.hostW = kind === 'solo' ? 'solo' : 'hub';
    if (kind === 'down') reset('down');
    ui(); return true;
  }

  VB.CareerCoop = {
    // estado
    guest: guestOn, host: hostOn, paired: paired, ready: function () { return S.ready; },
    names: function () { return S.names.slice(); },
    noP2: function () { return !!(S.match && S.match.noP2); },   // (career.js matchDone: este partido lo jugó el compañero de la IA)
    note: function () { return S.note; }, inMatch: function () { return !!S.match; },
    // entrada
    startHost: startHost, join: join, onJoinLink: onJoinLink, leave: leave, setReady: setReady,
    // career-ui
    intent: intent, hostPlay: hostPlay,
    // main.js (startCoopCareerMatch)
    matchOpts: function (o) { return matchOpts(o); }, matchLink: matchLink, matchStarted: matchStarted,
    // datos (pruebas: tools/cooptest.js)
    ensure: ensure, adopt: adopt, newP2: newP2, applySetup: applySetup, creditMate: creditMate, applyIntent: applyIntent, guestView: guestView,
    memStore: memStore, pack: pack, unpack: unpack, installGuest: function (c) { return installGuest(c); }, feed: feed,
    guestSum: guestSum, endX: endX, showSum: showSum, sheet: sheetWant, hostState: hostState, p2Rec: p2Rec, matchWatch: function () { matchWatch(); },
    P2_KEY: P2_KEY, KINDS: KINDS,
    _ext: EXT, _S: S, _onMsg: onMsg, _onReady: onReady, _reset: function () { reset(''); S.note = ''; S.down = null; }, _demo: demo, _tick: function () { tick(); }
  };
})();
