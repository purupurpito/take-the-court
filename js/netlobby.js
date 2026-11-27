/* =====================================================================
 * TAKE THE COURT — js/netlobby.js   (owner: net)
 * Modo online, fase 2 (notes/net.md «Fase 2»): la página «Online» del menú (#mpOnline, la monta ui.js) y la conexión entre los dos
 * jugadores. Decisiones de Ferran que se cumplen aquí:
 *   1. Al entrar ves la LISTA de salas abiertas (nombre de quien la creó, formato, sede, partido, Igualado o no, 1/2) y puedes crear
 *      una o entrar en una. También se puede entrar con el código de 6 (y el enlace ?sala=CÓDIGO). Las salas caducan solas.
 *   2. Solo con cuenta: sin sesión, el aviso «Necesitas una cuenta para jugar online» con el botón a Cuenta. Nada de anónimos.
 *   3. Cada jugador lleva SIEMPRE a su n.º 1 con un compañero IA y juega con SUS atributos e insignias de la Carrera (si no hay Carrera,
 *      los de su n.º 1 del escuadrón de Partido rápido; si tampoco, neutros). La sala puede ser «Igualado» (neutros, sin insignias).
 *   6. Del rival solo se ve su NOMBRE (nunca la IP ni el correo), con una flechita encima.
 *   7. Si las reglas de Firestore aún no están desplegadas: «El online aún no está activado en el servidor» (y nada se rompe).
 * Flujo: lista → crear sala (anfitrión) o entrar (invitado) → sala de espera con el nombre del rival → WebRTC (js/netrtc.js) con la
 * señalización en la sala (js/netroom.js) → intercambio «pre» (nombre y atributos del invitado) → ctx.actions.startOnline (main.js).
 * Durante el partido, si la conexión se cae, se renegocia sola sobre la misma sala (gen + 1) sin que la sesión lo note.
 * Pruebas: tools/netdrive.js --rtc (dos páginas del mismo Chrome con el emulador de Firestore: ?netemu=PUERTO&netuid=…; solo desde
 * file:// o localhost) y tools/roomtest.js (salas y reglas).
 * ===================================================================== */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var MENU_ON = true;    // entrada «Online» visible en Jugar (publicada en la fase 4; con false solo se ve con ?online=1)
  var Q = {}; try { new URLSearchParams(location.search).forEach(function (v, k) { Q[k] = v; }); } catch (e) { }
  var LOCAL = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var EMU = LOCAL && /^\d{2,5}$/.test(Q.netemu || '') ? +Q.netemu : 0;   // pruebas: emulador de Firestore, sin cuenta de verdad
  // capturas (SPLAT, 17-nov-2026): ?olmock=1 (solo file:// o localhost) = sesión y salas de mentira en memoria, sin red ni Firestore
  // (olmock=empty: sin salas; olmock=nortc: navegador sin WebRTC). VB.NetLobby._mock(o) pinta estados sueltos (avisos, conectando…).
  var MOCK = LOCAL && /^(1|empty|nortc)$/.test(Q.olmock || '') ? Q.olmock : '';
  var NICK = 'make-the-cut.nick', PREFS = 'make-the-cut.netroom', HELPK = 'make-the-cut.nethelp2';   // (nethelp2 = '1': ya vio «Cómo funciona»; Online V2 lo vuelve a enseñar por «Conexión»)
  // (pruebas, solo file:// o localhost: &netconnms=N acorta CONNECT_MS; tools/lobbytest.js lo usa para el invitado que nunca conecta)
  var CONNECT_MS = LOCAL && /^\d{3,5}$/.test(Q.netconnms || '') ? +Q.netconnms : 30000, OFFER_MS = 10000, OFFER_MAX = 65000, PRE_MS = 12000, LIST_EVERY = 8000, ROOM_POLL = 2000, SIG_POLL = 1000;   // (lecturas de Firestore: ver notes/net.md «Cuotas»)

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } return null; }
  function jls(k) { try { return JSON.parse(ls(k) || 'null'); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function NR() { return VB.NetRoom; }
  function ctx() { return VB.ctx || null; }
  /** Versión de la sala (room.v): PROTO|VB.VERSION|L<lobby>. Online V2: 'L2' = el lobby sabe de conexiones (sala con net, 'pre' con
   *  model). Una sala de un cliente de antes (sin la marca) sale como «Otra versión» y al revés, aunque VB.VERSION no cambie: un 1.8.2
   *  en caché no puede entrar en una sala Fluida creyéndola Precisa. (hay que subir VB.VERSION igualmente al publicar) */
  // Online de varios (sprint online-multi): 'L3' = el lobby sabe de salas de varios (esquema v3: 2 contra 2, 6 contra 6, Carrera
  // cooperativa). Un 1.21.0 (L2) ve TODAS las salas de este cliente como «Otra versión» (y al revés).
  var LOBBY = 3;
  function ver() { return (VB.Net ? VB.Net.PROTO : 0) + '|' + (VB.VERSION || '') + '|L' + LOBBY; }
  function sound(k) { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui(k); } catch (e) { } }

  /* ---------------- cuenta y backend ---------------- */
  function b64u(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
  function emuToken(uid) {
    var t = Math.floor(Date.now() / 1000);
    return b64u({ alg: 'none', typ: 'JWT' }) + '.' + b64u({ iss: 'https://securetoken.google.com/demo-mtc', aud: 'demo-mtc', auth_time: t, user_id: uid, sub: uid, iat: t, exp: t + 3600, firebase: { identities: {}, sign_in_provider: 'password' } }) + '.';
  }
  function signedIn() { if (EMU || MOCK) return true; var A = VB.Account; return !!(A && A.user && A.user() && A.netAuth); }
  /** Quién hay en la cuenta ('' si nadie): solo se reacciona cuando cambia (entrar, salir, cambiar de cuenta), no en cada sincronización. */
  function accKey() { if (!signedIn()) return ''; var A = VB.Account, i = A && A.netInfo && A.netInfo(); return (i && i.uid) || (A && A.user && A.user()) || '1'; }
  /** Sin WebRTC no se puede jugar ni abrir salas (p. ej. iOS en modo Aislamiento). */
  function noRtc() { if (MOCK) return MOCK === 'nortc'; return !VB.NetRtc || !VB.NetRtc.supported(); }
  var rooms = null, roomsKey = '';
  function api() {
    if (MOCK) return rooms || (rooms = mockApi());
    var key = EMU ? 'emu' : (VB.Account && VB.Account.netInfo && (VB.Account.netInfo() || {}).uid) || '';
    if (rooms && roomsKey === key) return rooms;
    roomsKey = key;
    if (EMU) {
      var uid = String(Q.netuid || 'emu' + Math.floor(Math.random() * 1e6)).replace(/[^\w-]/g, '').slice(0, 40);
      rooms = NR().create({ base: 'http://127.0.0.1:' + EMU + '/v1/projects/demo-mtc/databases/(default)/documents', ver: ver(), auth: function () { return Promise.resolve({ uid: uid, token: emuToken(uid) }); } });
    } else {
      var A = VB.Account;
      rooms = NR().create({ base: String(A.FS_BASE || '').replace(/\/+$/, ''), ver: ver(), auth: function () { return A.netAuth(); } });
    }
    return rooms;
  }

  /** ?olmock: salas en memoria con la misma forma que las de js/netroom.js (nada sale de la página). */
  function mockApi() {
    var me = 'mockMe', mine = null, P = function (v) { return Promise.resolve(v); };
    var mb = maps('beach'), mh = maps('hall');
    var R = MOCK === 'empty' ? [] : [
      { id: 'm1', code: 'K7P2QX', name: 'Lucía Marín', gname: '', venue: 'beach', map: mb[0] || '', bo: 1, pts: 21, even: false, state: 'open', age: 4000 },
      { id: 'm5', code: 'M2V4NP', name: 'Nerea Puig', gname: '', venue: 'beach', map: mb[0] || '', bo: 1, pts: 21, even: false, state: 'open', age: 6000, multi: true, mode: 'vs', cap: 4, fmt: '2v2', seats: {}, nseat: 1, free: 2 },
      { id: 'm2', code: 'H3M9RT', name: 'Pau Ferrer', gname: '', venue: 'hall', map: mh[1] || mh[0] || '', bo: 3, pts: 25, even: true, state: 'open', age: 9000 },
      { id: 'm3', code: 'W8ZK4N', name: 'Sara Llopis', gname: 'Iker', venue: 'hall', map: mh[0] || '', bo: 1, pts: 15, even: false, state: 'full', age: 12000 },
      { id: 'm4', code: 'T5BQ7J', name: 'Javi Ortega', gname: '', venue: 'beach', map: mb[1] || mb[0] || '', bo: 3, pts: 21, even: false, state: 'open', age: 20000, other: true },
      // (online de varios: m5, un 2 contra 2 con 2 de 4, y m6, un 6 contra 6 con 9 de 12)
      { id: 'm6', code: 'R6S6QK', name: 'Alex Roca', gname: '', venue: 'hall', map: mh[0] || '', bo: 3, pts: 25, even: false, state: 'open', age: 15000, multi: true, mode: 'vs', cap: 12, fmt: '6v6', seats: {}, nseat: 8, free: 3 }
    ];
    var find = function (id) { return id === me ? mine : R.filter(function (r) { return r.id === id; })[0] || null; };
    return {
      uid: function () { return me; }, list: function () { return P(R.slice()); }, sweep: function () { return P(); },
      open: function (o) {
        mine = { id: me, code: 'Q4WX8M', name: o.name, gname: '', host: me, guest: '', venue: o.venue, map: o.map, bo: o.bo, pts: o.pts, even: o.even, state: 'open', age: 0 };
        var mc = NR().multiCfg(o);   // (online de varios: la misma forma que una sala de varios de js/netroom.js)
        if (mc) { mine.multi = true; mine.mode = mc.mode; mine.cap = mc.cap; mine.fmt = mc.fmt; mine.venue = mc.venue; mine.seats = {}; mine.nseat = 0; mine.free = mc.cap - 1; mine.cnt = 0; }
        return P(mine);
      },
      unguest: function () { if (mine) { mine.guest = ''; mine.gname = ''; mine.state = 'open'; } return P(mine); },
      kick: function () { return P(mine); }, joinMulti: function (id) { return this.join(id); }, leaveMulti: function () { return P(); },
      beat: function (f) { if (mine && f) for (var k in f) mine[k] = f[k]; return P(mine); },
      get: function (id) { return P(find(id)); }, byCode: function (c) { return P(R.filter(function (r) { return r.code === c; })[0] || null); },
      join: function (id) {
        var r = find(id); if (!r) return Promise.reject({ code: 'gone' }); if (r.state === 'full' || (r.multi && r.free <= 0)) return Promise.reject({ code: 'full' });
        if (r.multi) { r.seats[me] = { n: myName(), at: Date.now() }; r.nseat++; r.free--; return P(r); }
        r.guest = me; r.state = 'full'; r.gname = myName(); return P(r);
      },
      leave: function () { }, close: function () { mine = null; }, bye: function () { }, delSig: function () { return P(); }, putSig: function () { return P(); },
      getSig: function () { return P(null); }, resume: function () { return P(null); },
      _rival: function (n) { if (mine) { mine.guest = 'mockRival'; mine.gname = n || 'Rival'; mine.state = 'full'; } }
    };
  }

  /* ---------------- nombre visible y atributos ---------------- */
  function careerPlayer() {
    var C = VB.Career; if (!C) return null;
    try { var m = C.mode ? C.mode() : 'beach', E = C[m === 'hall' ? 'hall' : 'beach'], c = E && E.get ? E.get() : null; return c && c.player ? c.player : null; } catch (e) { return null; }
  }
  /** Nombre por defecto (Google Play, 24-nov-2026): «Jugador NNNN», el mismo siempre en este aparato (VB.NameFilter.anonName,
   *  'make-the-cut.anon'). Ya NO sale el nombre del personaje de la Carrera ni el usuario de la cuenta: solo lo que escribas a mano. */
  function defaultName() {
    var F = VB.NameFilter;
    if (F && F.anonName) return F.anonName();
    return 'Jugador ' + (1000 + Math.floor(Math.random() * 9000));   // (sin namefilter.js: no pasa en el juego)
  }
  /** Tu nombre en el online: el que escribiste en «Tu nombre en el online» si vale (2-16, sin @ ni insultos); si no, el anónimo. */
  function myName() {
    if ((EMU || MOCK) && Q.name) return NR().cleanName(Q.name) || 'Jugador';
    var F = VB.NameFilter; if (F && F.migrateNick) F.migrateNick();
    var n = NR().cleanName(ls(NICK));
    return (n && !(F && F.bad(n)) ? n : '') || defaultName();
  }
  /** Lo que escribiste a mano ('' si juegas con el anónimo): el campo «Tu nombre en el online» empieza con esto y, vacío, enseña el
   *  anónimo de fondo; guardarlo vacío vuelve al anónimo. */
  function typedName() { if ((EMU || MOCK) && Q.name) return NR().cleanName(Q.name); var F = VB.NameFilter; if (F && F.migrateNick) F.migrateNick(); var n = NR().cleanName(ls(NICK)); return n && !(F && F.bad(n)) ? n : ''; }
  /** Nombre que llega de otro (sala, «pre», vuelta tras recargar): limpio y, si lleva un insulto, «Jugador NNNN» (seed = su uid). */
  function theirName(n, seed) { var c = NR().cleanName(n), F = VB.NameFilter; return c && F ? F.shown(c, seed) : c; }
  /** Tu nombre para mandarlo (salas de varios, coop, saludos): el que te pasen si vale (2-16, sin @ ni insultos); si no, myName()
   *  (tu apodo o «Jugador NNNN»). */
  function ownName(n) { var c = n ? NR().cleanName(n) : '', F = VB.NameFilter; return c && !(F && F.bad(c)) ? c : myName(); }
  function rivalUid() { var r = L.room; return r ? (L.role === 'host' ? r.guest : r.host) || '' : ''; }
  /* «Denunciar nombre» y «Bloquear» (js/report.js; auditoría legal, 25-nov-2026). Los bloqueados (solo en este aparato) no salen en la
   * lista, no se puede entrar por código en sus salas y, si entran en la tuya, se les saca. */
  function isBlocked(u) { var R = VB.Report; return !!(u && R && R.blocked && R.blocked(u)); }
  function roomHost(r) { return (r && (r.host || r.id)) || ''; }
  function roomBlocked(r) { if (!r) return false; if (isBlocked(roomHost(r))) return true; if (r.guest && isBlocked(r.guest)) return true; for (var u in (r.seats || {})) if (isBlocked(u)) return true; return false; }
  /** Los demás de la sala en la que estás (1v1 o de varios): [{u, n, raw}] (sin ti). */
  function others() {
    var out = [], me = accKey(), E = L.mx;
    if (E && E.room) {
      var seats = E.room.seats || {};
      if (E.room.host && E.room.host !== E.myU) out.push({ u: E.room.host, n: theirName(E.room.name0 || E.room.name, E.room.host) || 'Anfitrión', raw: E.room.name0 || E.room.name });
      (E.ro && E.ro.m || []).forEach(function (m) { if (m.u && m.u !== E.myU && m.u !== E.room.host) out.push({ u: m.u, n: m.n, raw: seats[m.u] && (seats[m.u].n0 || seats[m.u].n) || m.n }); });
      for (var u in seats) if (u !== E.myU && !out.some(function (x) { return x.u === u; })) out.push({ u: u, n: seats[u].n || 'Jugador', raw: seats[u].n0 || seats[u].n });
    } else if (L.room) {
      var ru = rivalUid(), r = L.room;
      if (ru && ru !== me) out.push({ u: ru, n: L.rival || 'Rival', raw: L.role === 'host' ? (r.gname0 || r.gname) : (r.name0 || r.name) });
    }
    return out;
  }
  /** Los de la lista de salas: anfitriones y sentados (como mucho 12). */
  function listPeople() {
    var out = [], seen = {};
    var add = function (u, n, raw) { if (u && !seen[u] && u !== accKey() && out.length < 12) { seen[u] = 1; out.push({ u: u, n: n || 'Jugador', raw: raw || n }); } };
    L.rooms.forEach(function (r) {
      add(roomHost(r), r.name, r.name0);
      if (r.guest) add(r.guest, r.gname, r.gname0);
      for (var u in (r.seats || {})) add(u, r.seats[u].n, r.seats[u].n0);
    });
    return out;
  }
  function reportOpen(people, code) {
    var R = VB.Report; if (!R || !R.sheet) return;
    R.sheet(people, { room: code || '', onBlock: function (x, on) {
      if (!on) return;
      if (L.view === 'list') { L.rooms = L.rooms.filter(function (r) { return !roomBlocked(r); }); render(true); return; }
      blockedIn();
    } });
  }
  /** Alguien bloqueado está en tu sala: anfitrión, se le saca; invitado en la sala de un bloqueado, sales tú. */
  function blockedIn() {
    var E = L.mx;
    if (E && E.room) {
      if (E.role === 'host') { (E.ro && E.ro.m || []).slice().forEach(function (m) { if (m.u !== E.myU && isBlocked(m.u) && !E.started) mxRelease(E, m.u, 'kick'); }); render(); }
      else if (isBlocked(E.room.host) && !L.started) { leaveRoom(); L.msg = 'Has salido de la sala de un jugador bloqueado.'; L.msgBad = false; setView('list'); refreshList(true); }
      return;
    }
    if (!L.room || L.started) return;
    var ru = rivalUid(); if (!isBlocked(ru)) return;
    if (L.role === 'host') { abortConn(); api().delSig(L.room.id).catch(function () { }); if (api().unguest) api().unguest().catch(function () { }); L.rival = ''; L.status = 'wait'; render(); }
    else { leaveRoom(); L.msg = 'Has salido de la sala de un jugador bloqueado.'; L.msgBad = false; setView('list'); refreshList(true); }
  }
  function sanAttrs(st) {
    if (!st || typeof st !== 'object') return null;
    var K = VB.ATTR_KEYS || ['jump', 'speed', 'react', 'recv', 'dig', 'set', 'spike', 'ctl', 'block', 'serve'], o = {}, any = false;
    K.forEach(function (k) { var v = Math.round(+st[k]); if (isFinite(v)) { o[k] = Math.max(1, Math.min(99, v)); any = true; } });
    return any ? o : null;
  }
  function sanBadges(b) {
    if (!b || typeof b !== 'object') return null;
    var o = {}, n = 0;
    Object.keys(b).slice(0, 16).forEach(function (k) { var v = b[k] | 0; if (/^[a-z]{2,16}$/.test(k) && v >= 1 && v <= 3 && n < 12) { o[k] = v; n++; } });
    return n ? o : null;
  }
  /** Atributos e insignias con los que juegas: tu jugador de la Carrera activa; si no hay, tu n.º 1 del Partido rápido; si no, neutros. */
  function myStats() {
    var p = careerPlayer(), B = VB.Badges;
    if (p && p.st) return { attrs: sanAttrs(p.st), badges: sanBadges(B && B.forPlayer ? safe(function () { return B.forPlayer(p); }) : null), from: 'career' };
    var P = VB.Prog, at = P && P.attrs ? safe(function () { return P.attrs(); }) : null, bd = B && B.forSquad ? safe(function () { return B.forSquad(); }) : null;
    var a0 = at && at[0] && at[0][0], b0 = bd && bd[0] && bd[0][0];
    if (a0) return { attrs: sanAttrs(a0), badges: sanBadges(b0), from: 'squad' };
    return { attrs: null, badges: null, from: 'none' };
  }
  function safe(f) { try { return f(); } catch (e) { return null; } }
  /** Fase 3: lo que el rival ve de tus dos jugadores. fits = tus looks del Vestuario (n.º 1 y n.º 2, los de Partido rápido:
   *  VB.Look.matchLooks) y kit = tu equipación de Ajustes. Solo estética: nada entra en la sim. */
  function myLook() {
    var Lk = VB.Look, st = (ctx() && ctx().settings) || {}, fits = [null, null];
    var m = Lk && Lk.matchLooks ? safe(function () { return Lk.matchLooks({}); }) : null;
    if (Array.isArray(m)) fits = [m[0] || null, m[1] || null];
    return saneLook({ fits: fits, kit: { kitShirt: st.kitShirt, kitAccent: st.kitAccent, kitShorts: st.kitShorts, kitPattern: st.kitPattern } });
  }
  /** Look recibido del rival (o el propio antes de mandarlo), SIEMPRE saneado: fits por VB.Look.sane (8 KB como mucho cada uno),
   *  colores enteros de 24 bits y el diseño con formato. null si no vale. */
  function saneLook(o) {
    if (!o || typeof o !== 'object') return null;
    var Lk = VB.Look, f = Array.isArray(o.fits) ? o.fits : [], out = { fits: [null, null], kit: {} };
    for (var i = 0; i < 2; i++) {
      var x = f[i];
      if (!x || typeof x !== 'object' || !Lk || !Lk.sane) continue;
      var raw = safe(function () { return JSON.stringify(x); });
      if (!raw || raw.length > 8192) continue;
      out.fits[i] = safe(function () { return Lk.sane(JSON.parse(raw), i); }) || null;
    }
    var k = o.kit && typeof o.kit === 'object' ? o.kit : {};
    ['kitShirt', 'kitAccent', 'kitShorts'].forEach(function (n) { var v = k[n]; if (typeof v === 'number' && isFinite(v)) out.kit[n] = (v | 0) & 0xffffff; });
    if (typeof k.kitPattern === 'string' && /^[a-z]{2,12}$/.test(k.kitPattern)) out.kit.kitPattern = k.kitPattern;
    return out;
  }

  /* ---------------- textos de la sala ---------------- */
  function venueName(r) { var n = r.map && VB.Venues && VB.Venues.name ? VB.Venues.name(r.map) : ''; return n || (r.venue === 'beach' ? 'Playa' : 'Pabellón'); }
  function cfgParts(r) {
    var kind = r.venue === 'beach' ? 'Playa' : 'Pabellón', vn = venueName(r);
    return [kind].concat(vn && vn !== kind ? [vn] : [], chips(r, true));
  }
  /** Online V2: conexión de la sala ('fluida' solo si la sala lo dice; sin la clave, Precisa, la de siempre). */
  // (online de varios: 2 contra 2 siempre Precisa; 6 contra 6, el modelo del anfitrión, 'host', VB.NetHost; la coop, Precisa)
  function roomModel(r) { if (r && r.multi) return r.net === 'host' || r.fmt === '6v6' ? 'host' : 'precisa'; return r && r.net === 'fluida' ? 'fluida' : 'precisa'; }
  /** Chips del partido (lista, vista previa de «Crear sala» y sala de espera). (fase 6: puntos por set en Pabellón)
   *  Online V2: un tercer chip «Fluida» solo en las salas Fluida (aria: «conexión fluida»). */
  function chips(r, aria) {
    var p = r.pts || 21;
    var out = [r.bo === 3 ? '3 sets a ' + p : '1 set a ' + p, r.even ? 'Igualado' : 'Con sus atributos'];
    // (el chip visible va PRIMERO: .fx-chips corta lo que no cabe y en un móvil en vertical el último no se ve; en el aria, al final)
    if (roomModel(r) === 'fluida') { if (aria) out.push('conexión fluida'); else out.unshift('Fluida'); }
    if (r.multi) out.unshift(FMT_TXT[fmtOf(r)]);   // (online de varios: el formato, el primero)
    return out;
  }
  function chipsHTML(r) { return chips(r).map(function (t) { return '<i>' + esc(t) + '</i>'; }).join(''); }
  function sep(parts) { return parts.map(esc).join(', '); }

  /* ---------------- estado ---------------- */
  var L = {
    host: null, on: false, view: 'list', rooms: [], listAt: 0, listErr: '', loading: false, edit: '', msg: '', msgBad: false,
    room: null, role: '', rival: '', status: '', fail: '', cfg: null, link: null, gen: 0, conn: null, started: false, pendingCode: ''
  };
  var timers = {};
  function every(k, ms, f) { clearInterval(timers[k]); timers[k] = setInterval(f, ms); }
  function stop(k) { clearInterval(timers[k]); clearTimeout(timers[k]); delete timers[k]; }
  function stopAll(keep) { Object.keys(timers).forEach(function (k) { if (!keep || keep.indexOf(k) < 0) stop(k); }); }

  function prefs() {
    var p = jls(PREFS) || {};
    return { venue: p.venue === 'beach' ? 'beach' : 'hall', mapH: String(p.mapH || ''), mapB: String(p.mapB || ''), bo: +p.bo === 3 ? 3 : 1, even: !!p.even, pts: [11, 15, 21, 25].indexOf(+p.pts) >= 0 ? +p.pts : 21,
      model: p.model === 'fluida' ? 'fluida' : 'precisa',   // (Online V2: conexión; Precisa si no se eligió nunca)
      fmt: p.fmt === '2v2' || p.fmt === '6v6' ? p.fmt : '1v1' };   // (online de varios: formato de la sala; 1 contra 1 si no se eligió nunca)
  }
  function savePrefs(c) { try { ls(PREFS, JSON.stringify(c)); } catch (e) { } }
  function maps(kind) { var V = VB.Venues; var l = V && V.list ? safe(function () { return V.list(kind); }) : null; return Array.isArray(l) && l.length ? l : ['']; }

  /** Salas de otra versión: si alguna es de una versión más nueva que la mía, el aviso de reiniciar (js/update.js). */
  function verNote(rs) {
    var U = VB.Update, nw = false;
    if (!U || !rs) return;
    for (var i = 0; i < rs.length; i++) if (rs[i] && rs[i].other && typeof rs[i].v === 'string' && U.note(rs[i].v.split('|')[1]) > 0) nw = true;
    if (nw) U.show(true);
  }
  function errText(e, what) {
    var c = e && e.code;
    if (c === 'off') return 'El online aún no está activado en el servidor. Vuelve a probar en un rato.';
    if (c === 'auth') return 'Tu sesión ha caducado: vuelve a entrar en tu cuenta.';
    if (c === 'net') return 'No hay conexión con el servidor. Comprueba tu red y vuelve a probar.';
    if (c === 'full') return 'Esa sala ya está llena.';
    if (c === 'kicked') return 'Te ha sacado el que ha creado la sala: ya no puedes volver a entrar.';
    if (c === 'gone') return 'Esa sala ya no existe.';
    if (c === 'version') return VB.Update && VB.Update.outdated() ? 'Tienes una versión anterior del juego: reinicia para actualizarlo.' : 'Esa sala es de otra versión del juego: el que la ha creado tiene que reiniciar el juego.';
    if (c === 'dup') return 'Hay más de una sala con ese código: entra desde la lista o pídele el enlace al que la ha creado.';
    return what || 'No ha salido. Prueba otra vez.';
  }

  /* ---------------- lista ---------------- */
  function refreshList(manual) {
    if (!L.on || L.view !== 'list' || L.loading) return;
    if (!signedIn()) { setView('noacc'); return; }
    L.loading = true; if (manual) render();
    api().list().then(function (rs) {
      L.loading = false; L.rooms = rs.filter(function (r) { return !roomBlocked(r); }); L.listAt = Date.now(); L.listErr = ''; verNote(rs);
      if (L.view === 'off') setView('list');
      render();
    }, function (e) {
      L.loading = false;
      if (e.code === 'off') { setView('off'); return; }
      if (e.code === 'auth' && !signedIn()) { setView('noacc'); return; }
      L.listErr = errText(e); render();
    });
    if (Math.random() < 0.2) api().sweep().catch(function () { });
  }
  function setView(v) {
    L.view = v; L.edit = ''; L.osk = null;
    stop('list'); stop('retry');
    if (v === 'list') { every('list', LIST_EVERY, function () { if (document.visibilityState !== 'hidden') refreshList(false); }); }
    // (sin servidor: se vuelve a probar solo cada 30 s; el móvil lo dice en la hoja)
    if (v === 'off') every('retry', 30000, function () {
      if (!L.on || L.view !== 'off' || document.visibilityState === 'hidden' || noRtc()) return;
      // (se prueba sin cambiar de vista: si el servidor sigue apagado no pasa nada; el foco no salta cada 30 s)
      api().list().then(function (rs) { if (L.on && L.view === 'off') { L.rooms = rs; L.listAt = Date.now(); L.listErr = ''; setView('list'); } }, function () { });
    });
    render(true);
  }

  /* ---------------- crear sala (anfitrión) ---------------- */
  function createRoom() {
    if (noRtc()) { setView('nortc'); return; }   // (revisión F4: sin WebRTC nunca se abre ni se ocupa una sala)
    var c = L.cfg; savePrefs(c);
    if (c.fmt === '2v2' || c.fmt === '6v6') { mCreate(c); return; }   // (online de varios: sala de 2 contra 2 o 6 contra 6)
    var map = c.venue === 'beach' ? c.mapB : c.mapH;
    L.msg = ''; L.busy = true; render();
    api().open({ name: myName(), venue: c.venue, map: map, bo: c.bo, even: c.even, pts: c.venue === 'beach' ? 21 : c.pts, net: c.model === 'fluida' ? 'fluida' : undefined }).then(function (r) {
      L.busy = false;
      if (!r) throw { code: 'error' };
      L.room = r; L.role = 'host'; L.rival = ''; L.fail = ''; L.started = false; L.status = 'wait';
      setView('room'); turnReady();   // (TURN: se piden ya, mientras se espera al rival)
      every('beat', NR().BEAT_MS, hostBeat);
      every('poll', ROOM_POLL, hostPoll);
    }).catch(function (e) {
      L.busy = false;
      if (e && e.code === 'off') { setView('off'); return; }
      // (Online V2: con las reglas de antes, una sala Fluida da 403 aunque la lista funcione)
      L.msg = e && e.code === 'denied' && c.model === 'fluida' ? 'La conexión Fluida aún no está activada.' : errText(e, 'No se ha podido crear la sala.'); L.msgBad = true; render();
    });
  }
  function hostBeat() {
    api().beat().then(function (r) { if (!r && L.role === 'host') roomGone('Tu sala ha caducado. Crea otra.'); }, function () { });
  }
  function hostPoll() {
    if (L.role !== 'host' || !L.room || L.started) return;
    api().get(L.room.id).then(function (r) {
      if (L.role !== 'host' || L.started) return;
      if (!r) { roomGone('Tu sala se ha cerrado.'); return; }
      L.room = r;
      if (r.guest && isBlocked(r.guest)) { if (L.conn) abortConn(); if (api().unguest) api().unguest().catch(function () { }); L.rival = ''; L.status = 'wait'; render(); return; }   // (js/report.js: bloqueado)
      if (r.guest && r.state === 'full' && (!L.conn || L.conn.guest !== r.guest)) hostConnect(r);
      else if (!r.guest && L.conn) { abortConn(); api().delSig(L.room.id).catch(function () { }); L.rival = ''; L.status = 'wait'; L.fail = (L.fail || ''); render(); }
      else render();
    }, function () { });
  }
  /* TURN de respaldo (Imprescindible 4.1, notes/turn.md): antes de cada offer()/answer() se piden credenciales temporales al Worker
   * (VB.NET_TURN_URL de js/netconfig.js) con el ID token de la cuenta; como mucho NetRtc.TURN_WAIT_MS y, si no llegan, solo STUN.
   * Apagado (null, sin esperas ni peticiones) con la URL vacía, en las pruebas con emulador (?netemu) o salas de mentira (?olmock),
   * y con ?netice=none. Desde file:// o localhost, ?netturn=URL la pone a mano (para probar el Worker con «wrangler dev»). */
  if (LOCAL && Q.netturn) VB.NET_TURN_URL = Q.netturn;
  function turnReady() {
    var R = VB.NetRtc, A = VB.Account;
    if (EMU || MOCK || (Q.netice === 'none' && LOCAL) || !R || !R.turnPrep || !R.turnUrl() || !signedIn()) return null;
    return R.turnPrep(function () { return A.netAuth().then(function (a) { return a && a.token; }); });
  }
  function withTurn(fn) { var p = turnReady(); return p ? p.then(fn, fn) : fn(); }
  function newLink() {
    if (L.link) { var o = L.link; L.link = null; o.onclose = null; o.close(); }
    var ice = Q.netice === 'none' && LOCAL ? [] : undefined;
    var k = new VB.NetRtc.Link({ iceServers: ice, onstate: onLinkState });
    L.link = k; return k;
  }
  /** Generación de la señalización: siempre creciente, también entre recargas de la página (segundos desde oct-2025, cabe en int32),
   *  para que una oferta o respuesta de una sesión anterior nunca pase por nueva. */
  function nextGen() { L.gen = Math.max(L.gen + 1, Math.floor(Date.now() / 1000) - 1760000000); return L.gen; }
  function abortConn() { stop('connT'); stop('sig'); L.conn = null; if (L.link && !L.started) { var k = L.link; L.link = null; k.onclose = null; k.close(); } }
  function hostConnect(r) {
    abortConn();
    var conn = L.conn = { guest: r.guest, t0: Date.now(), gen: nextGen(), pre: false };
    L.rival = theirName(r.gname, r.guest) || 'Rival'; L.status = 'connecting'; L.fail = ''; render();
    sound('click');
    var link = newLink(), id = L.room.id;
    withTurn(function () { return link.offer(); }).then(function (sdp) {
      if (L.conn !== conn) return;
      return api().putSig(id, 'offer', { sdp: sdp, gen: conn.gen, to: conn.guest }).then(function () {
        every('sig', SIG_POLL, function () {
          if (L.conn !== conn || conn.answered) return;
          api().getSig(id, 'answer').then(function (a) {
            if (L.conn !== conn || conn.answered || !a || a.gen !== conn.gen || a.uid !== conn.guest) return;
            conn.answered = true; stop('sig');
            link.accept(a.sdp).catch(function () { connFail(); });
          }, function () { });
        });
      });
    }).catch(function () { if (L.conn === conn) connFail(); });
    timers.connT = setTimeout(function () { if (L.conn === conn && !L.started && (!L.link || L.link.state !== 'open' || !conn.pre)) connFail(); }, CONNECT_MS);
  }
  function connFail(why) {
    var who = L.rival || 'tu rival';
    // (why = 'mismatch': Online V2, el anfitrión juega con otra conexión que la que anuncia la sala; mismo texto que main.js)
    L.fail = why === 'mismatch' ? (L.role === 'host' ? 'La versión del juego de ' + who + ' no usa la conexión de la sala: no hay partido.' : 'La sala no coincide con lo anunciado: no hay partido.')
      : 'No se ha podido conectar directamente con ' + who + ': vuestras redes no lo permiten. Probad otra vez o desde otra red.';
    if (L.role === 'host') {
      abortConn(); L.rival = ''; L.status = 'wait';
      api().beat({ state: 'open', guest: '', gname: '' }).catch(function () { });
      api().delSig(L.room.id).catch(function () { });
    } else {
      abortConn(); var id = L.room && L.room.id; L.role = ''; L.room = null; stopAll();
      if (id) api().leave(id);
      L.msg = L.fail; L.msgBad = true; L.fail = '';
      setView('list'); refreshList(false);
      return;
    }
    render();
  }
  function roomGone(msg) {
    var wasStarted = L.started;
    abortConn(); stopAll(); L.room = null; L.role = ''; L.rival = '';
    if (wasStarted) return;
    L.msg = msg; L.msgBad = true;
    if (L.on) { setView('list'); refreshList(false); }
  }

  /* ---------------- entrar en una sala (invitado) ---------------- */
  function joinRoom(id) {
    if (noRtc()) { setView('nortc'); return; }   // (revisión F4: sin WebRTC nunca se abre ni se ocupa una sala)
    L.msg = ''; L.busy = true; render();
    api().join(id, myName()).then(function (r) {
      L.busy = false;
      if (r && r.multi) { mJoined(r); return; }   // (online de varios: te has sentado en una sala de 2v2 / 6v6)
      L.room = r; L.role = 'guest'; L.rival = theirName(r.name, r.host) || 'Rival'; L.status = 'connecting'; L.fail = ''; L.started = false;
      setView('room'); sound('click'); turnReady();   // (TURN: se piden ya, mientras llega la oferta)
      L.gotOffer = false;
      guestListen(0);
      every('poll', 3000, guestPoll);
      // Quien creó la sala contesta con una oferta en 2-4 s. Si en OFFER_MS no ha llegado y su sala lleva más de un latido sin
      // renovarse, ya no está (pestaña cerrada sin avisar): «no responde». Si el latido sigue al día (p. ej. su pestaña está en segundo
      // plano y Chrome la frena a 1 temporizador por minuto) se le espera hasta OFFER_MAX. Nunca «vuestras redes» sin haber negociado.
      var tJoin = Date.now();
      timers.offerT = setTimeout(function chk() {
        if (L.role !== 'guest' || L.started || L.gotOffer || !L.room) return;
        if (Date.now() - tJoin > OFFER_MAX) { noHost(); return; }
        api().get(L.room.id).then(function (r2) {
          if (L.role !== 'guest' || L.started || L.gotOffer) return;
          if (r2 && r2.age > NR().BEAT_MS + 10000) noHost(); else timers.offerT = setTimeout(chk, 5000);
        }, function () { timers.offerT = setTimeout(chk, 5000); });
      }, OFFER_MS);
      timers.connT = setTimeout(function () { if (L.role === 'guest' && !L.started && L.gotOffer) connFail(); }, CONNECT_MS + 5000);
    }).catch(function (e) {
      L.busy = false;
      if (e && e.code === 'off') { setView('off'); return; }
      L.msg = errText(e, 'No se ha podido entrar en la sala.'); L.msgBad = true; render(); refreshList(false);
    });
  }
  function joinCode(code) {
    if (noRtc()) { setView('nortc'); return; }   // (revisión F4: sin WebRTC nunca se abre ni se ocupa una sala)
    code = NR().normCode(code);
    if (!NR().codeOk(code)) { L.msg = 'El código tiene 6 letras y cifras (sin 0, O, 1, I ni L).'; L.msgBad = true; render(); return; }
    L.busy = true; render();
    api().byCode(code).then(function (r) {
      L.busy = false;
      if (!r) { L.msg = 'No hay ninguna sala abierta con el código ' + code + '.'; L.msgBad = true; render(); return; }
      if (isBlocked(roomHost(r))) { L.msg = 'Has bloqueado a quien creó esta sala.'; L.msgBad = true; render(); return; }
      if (r.mode === 'coop') { coopLink(code); return; }   // (código de una Carrera cooperativa: VB.CareerCoop o la hoja de unirse)
      joinRoom(r.id);
    }, function (e) { L.busy = false; if (e.code === 'off') { setView('off'); return; } L.msg = errText(e); L.msgBad = true; render(); });
  }
  /** Invitado: espera una oferta de generación nueva y contesta (también para reconectar durante el partido). */
  function guestListen(minGen) {
    var id = L.room.id, seen = minGen;
    every('sig', SIG_POLL, function () {
      if (L.role !== 'guest' || !L.room) { stop('sig'); return; }
      // (con la conexión abierta solo se mira si la sesión espera al rival: el anfitrión puede haber renegociado antes de que aquí se note la caída)
      if (L.link && L.link.state === 'open' && !(L.started && netWaiting())) return;
      api().getSig(id, 'offer').then(function (o) {
        if (!o || o.gen <= seen || L.role !== 'guest' || (o.to && o.to !== api().uid())) return;
        seen = o.gen; L.gen = o.gen;
        if (!L.gotOffer && !L.started) { L.gotOffer = true; stop('offerT'); stop('connT'); timers.connT = setTimeout(function () { if (L.role === 'guest' && !L.started) connFail(); }, CONNECT_MS + 5000); }
        var link = L.started && L.link ? L.link : newLink();
        withTurn(function () { return link.answer(o.sdp); }).then(function (sdp) { return api().putSig(id, 'answer', { sdp: sdp, gen: o.gen }); }).catch(function () { });
      }, function () { });
    });
  }
  function noHost() {
    var id = L.room && L.room.id, who = L.rival || 'El que ha creado la sala';
    abortConn(); stopAll(); L.role = ''; L.room = null; L.rival = ''; L.status = '';
    if (id) api().leave(id);
    L.msg = who + ' no responde: parece que ya no está en la sala. Prueba con otra.'; L.msgBad = true;
    if (L.on) { setView('list'); refreshList(false); }
  }
  function netWaiting() { var C = ctx(), r = C && C.net && C.net.r; return !!(r && r.status === 'waiting'); }
  function guestPoll() {
    if (L.role !== 'guest' || !L.room || L.started) return;
    api().get(L.room.id).then(function (r) {
      if (L.role !== 'guest' || L.started) return;
      if (!r || (r.guest && r.guest !== api().uid()) || (!r.guest && r.state === 'open')) roomGone(L.fail || 'Han cerrado la sala.');
      else if (r.age > NR().LIVE_MS) roomGone('La sala se ha cerrado.');
      else { L.room = r; render(); }
    }, function () { });
  }

  /* ---------------- conexión abierta: «pre» y partido ---------------- */
  function onLinkState(s) {
    if (s === 'open') {
      if (!L.started) { L.status = 'linked'; render(); preStart(); }
      else if (L.role === 'host') { stop('relink'); stop('sig'); api().delSig(L.room.id).catch(function () { }); }
    } else if (s === 'down' && L.started) relink();
  }
  function preStart() {
    var link = L.link; if (!link) return;
    var me = myName(), st = myStats();
    if (L.role === 'guest') link.send('ctl', JSON.stringify({ k: 'pre', name: me, st: { attrs: st.attrs, badges: st.badges, aimSet: myAimSet(), jsetAim: myJsetAim() }, look: myLook(), model: roomModel(L.room) }));
    var t0 = Date.now();
    every('pre', 50, function () {
      if (!L.link || L.link !== link) { stop('pre'); return; }
      if (Date.now() - t0 > PRE_MS) { stop('pre'); connFail(); return; }
      var msgs = link.poll(), rest = [];
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i], c = null;
        if (m.ch === 'ctl') { try { c = JSON.parse(m.data); } catch (e) { } }
        if (c && c.k === 'pre') { stop('pre'); rest = rest.concat(msgs.slice(i + 1)); link.q = rest.concat(link.q); begin(c, st); return; }
        rest.push(m);
      }
      link.q = rest.concat(link.q);
    });
  }
  function myAimSet() { var C = ctx(); return !(C && C.settings && C.settings.aimSet === false); }
  /** Salto con impulso (v1.12.0): «Colocación en salto con diana» (Ajustes, Juego), por defecto no. Como aimSet, es un ajuste de cada
   *  jugador (viaja también en «Igualado»); un invitado de antes no lo manda y juega sin ella. */
  function myJsetAim() { var C = ctx(); return !!(C && C.settings && C.settings.jsetAim === true); }
  function begin(pre, st) {
    var C = ctx(); if (!C || !C.actions || !C.actions.startOnline) { connFail(); return; }
    var r = L.room, opts = null, rivalName = theirName(pre.name, rivalUid()) || L.rival || 'Rival';
    L.rival = rivalName;
    // Online V2: conexión de la sala. El invitado comprueba que el anfitrión juega con la que anuncia la sala (sin model = Precisa)
    var model = roomModel(r);
    // y el anfitrión, que el invitado juega con la de la sala (un cliente de antes no manda model = Precisa: fuera antes de startOnline)
    if ((pre.model === 'fluida' ? 'fluida' : 'precisa') !== model) { connFail('mismatch'); return; }
    if (L.role === 'host') {
      var gst = pre.st || {}, even = !!r.even;
      var seed = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] >>> 1 : Math.floor(Math.random() * 2147483647);
      opts = { online: true, seed: seed, venue: r.venue === 'beach' ? 'beach' : 'hall', mapId: r.map || '', bestOf: r.bo === 3 ? 3 : 1, points: r.pts || 21, even: even,
        present: true, stats: true,
        // (auditoría: «Colocación dirigida» es un ajuste de cada jugador, no una ventaja: viaja también en «Igualado»)
        // (salto con impulso: djump = salto con dirección de los dos humanos; jsetAim = la diana de colocación de cada uno)
        djump: true,
        humans: [even ? { aimSet: myAimSet(), jsetAim: myJsetAim() } : { attrs: st.attrs || undefined, badges: st.badges || undefined, aimSet: myAimSet(), jsetAim: myJsetAim() },
          even ? { aimSet: gst.aimSet !== false, jsetAim: gst.jsetAim === true } : { attrs: sanAttrs(gst.attrs) || undefined, badges: sanBadges(gst.badges) || undefined, aimSet: gst.aimSet !== false, jsetAim: gst.jsetAim === true }] };
      // Online V2 (Fluida): sin tiempos muertos (notes/online-v2-spec.md §2.1); árbitro y challenge como en Precisa desde 1.14.1
      if (model === 'fluida') { opts.net = 'fluida'; opts.timeouts = false; }
      L.link.send('ctl', JSON.stringify({ k: 'pre', name: myName(), look: myLook(), model: model }));
      api().beat({ state: 'play' }).catch(function () { });
      api().delSig(r.id).catch(function () { });
    }
    stopAll(L.role === 'host' ? ['beat'] : []);
    L.started = true; L.status = 'play';
    var link = L.link;
    link.onclose = function () { matchClosed(link); };
    // (auditoría: el invitado comprueba que el anfitrión manda lo que anuncia la sala: «Igualado», sets, puntos y sede)
    var expect = L.role === 'guest' ? { even: !!r.even, bestOf: r.bo === 3 ? 3 : 1, points: r.pts || 21, venue: r.venue === 'beach' ? 'beach' : 'hall', net: r.net || undefined } : null;
    var ok = C.actions.startOnline({ slot: L.role === 'host' ? 0 : 1, link: link, opts: opts, name: myName(), rivalName: rivalName,
      look: { mine: myLook(), theirs: saneLook(pre.look) }, expect: expect, model: model });
    if (!ok) { L.started = false; connFail(); return; }
    if (L.role === 'guest') guestListen(L.gen);   // (vigila ofertas nuevas: solo lee Firestore si la conexión cae o la sesión espera)
    render();
  }
  /** La conexión se cayó en pleno partido: se renegocia sobre la misma sala (la sesión espera; a los 60 s decide ella). */
  function relink() {
    if (!L.room) return;
    if (L.role === 'guest') { guestListen(L.gen); return; }
    var tries = 0;
    var go = function () {
      if (!L.started || !L.link || L.link.state === 'open' || L.link.state === 'closed' || tries++ > 6) { stop('relink'); return; }
      var gen = nextGen(), link = L.link, id = L.room.id, to = L.room.guest;
      withTurn(function () { return link.offer(); }).then(function (sdp) { return api().putSig(id, 'offer', { sdp: sdp, gen: gen, to: to }); }).then(function () {
        var t0 = Date.now();
        every('sig', SIG_POLL, function () {
          if (L.gen !== gen || !L.link || L.link.state === 'open' || Date.now() - t0 > 9000) { stop('sig'); return; }
          api().getSig(id, 'answer').then(function (a) { if (a && a.gen === gen && a.uid === to && L.gen === gen) { stop('sig'); link.accept(a.sdp).catch(function () { }); } }, function () { });
        });
      }).catch(function () { });
    };
    stop('relink'); setTimeout(go, 600); every('relink', 10000, go);
  }
  function matchClosed(link) {
    if (L.link !== link) return;
    var wasHost = L.role === 'host';
    stopAll(); L.link = null; L.started = false; L.conn = null;
    if (wasHost) api().close();
    L.room = null; L.role = ''; L.rival = '';
    L.view = 'list';
  }

  /* ---------------- salir ---------------- */
  function leaveRoom() {
    if (L.mx) { var E0 = L.mx; L.mx = null; mxLeave(E0); L.room = null; L.role = ''; L.rival = ''; L.status = ''; L.fail = ''; L.started = false; stopAll(); return; }   // (online de varios)
    var id = L.room && L.room.id, role = L.role;
    abortConn(); stopAll(); L.room = null; L.role = ''; L.rival = ''; L.status = ''; L.fail = '';
    if (role === 'host') api().close(); else if (role === 'guest' && id) api().leave(id);
  }

  /* ---------------- pintado ---------------- */
  // SPLAT (17-nov-2026, notes/splat.md «Online»): la página es una .sp-page (index.html) y aquí va solo lo propio del lobby. Salas =
  // brochazos (.sp-ticket: turquesa en pista, dorado en la playa), acciones = manchas (.sp-btn), «Abrir sala» = parche cosido, hojas
  // (ayuda, sala de espera, avisos, teclado) = .sp-panel. Alto: la cabecera (Volver) y la barra de abajo de cada vista (Entendido,
  // Abrir sala, Salir) NUNCA se van; lo que sobra se desplaza por dentro (lista de salas, selectores, ayuda, tarjeta). Ver el bug del
  // 17-nov-2026 (gente atrapada en «Cómo funciona» en un móvil apaisado bajo). P = refuerzo de 3 ids del sistema (estructura).
  var P = ':root:not(#_):not(#_):not(#_) ';
  var PP = ':root.ph' + P.slice(5), PW = ':root.ph.ph-w' + P.slice(5);   // (móvil: html.ph; ancho ≥ 800: html.ph-w)
  function ph() { return !!(VB.Splat && VB.Splat.phone && VB.Splat.phone()); }
  /** (ronda 2, menus-v) móvil en vertical (html.pv): la maqueta de PC con su CSS de vertical (index.html, bloque menus-v); los avisos van
   *  al carril de arriba como en el móvil apaisado y «Este navegador no puede» lleva Copiar enlace y Volver. */
  function pvv() { return !!(VB.Splat && VB.Splat.pv && VB.Splat.pv()); }
  var CSS = [
    '#menu.sp-full #mpOnline{--sp-colw:clamp(360px,54vw,780px);padding-bottom:calc(var(--sp-pad) + 36px + var(--sbm))}',
    '#mpOnline .ol-body{display:flex;flex-direction:column;gap:var(--sp-gap,12px);flex:0 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;',
    'padding:8px 14px 12px 8px;margin:-8px -14px -12px -8px;scrollbar-width:thin;scrollbar-color:rgba(255,244,220,.55) transparent}',
    '#mpOnline .ol-scroll{flex:0 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:rgba(255,244,220,.55) transparent}',
    '#mpOnline .ol-ic svg{fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}',
    // barra de acciones (una sola parada de ↑↓; ←→ la recorre: netlobby rowStep) y barras de abajo
    '#mpOnline .ol-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;flex:none;padding:2px 4px 4px}',
    '#mpOnline .ol-act{--sp-h:clamp(46px,8vh,58px);--sp-fs:clamp(13px,2.3vh,18px)}',
    P + '#mpOnline .ol-act.ol-nm{flex:1 1 140px;min-width:0;justify-content:flex-start}',
    P + '#mpOnline .ol-act.ol-ico{--sp-px:0;width:var(--sp-h);flex:none}',
    '#mpOnline .ol-me{min-width:0;overflow:hidden;text-overflow:ellipsis;text-transform:none;letter-spacing:.01em}',
    '#mpOnline .ol-q{font:400 1.35em/1 var(--sp-pop)}',
    '#mpOnline .ol-act.spin .ol-ic svg{animation:olSpin .8s linear infinite}@keyframes olSpin{to{transform:rotate(360deg)}}',
    '#mpOnline .ol-bar2{flex-wrap:nowrap;gap:14px}',
    P + '#mpOnline .ol-bar2 .sp-btn{flex:0 1 auto;min-width:0}',
    P + '#mpOnline .ol-bar2 .sp-btn .sp-t{overflow:visible}',
    '#mpOnline .ol-bar2 .sp-patch{--sp-ph:clamp(52px,10vh,84px)}',
    // avisos
    '#mpOnline .ol-note{flex:none;margin:0 4px;padding:9px 14px;border-radius:12px 16px 10px 14px/14px 10px 16px 12px;background:var(--sp-cream);color:var(--sp-ink);',
    'box-shadow:0 0 0 2.5px var(--sp-ink),3px 4px 0 2.5px var(--sp-ink);font:700 clamp(12px,2vh,14px)/1.35 var(--sp-ui);transform:rotate(-.4deg)}',
    '#mpOnline .ol-note.bad{background:#ffe1e4;box-shadow:0 0 0 2.5px var(--sp-ink),inset 7px 0 0 var(--sp-danger),3px 4px 0 2.5px var(--sp-ink);padding-left:20px}',
    // rótulo de la cartelera: trazo de tinta con letra crema
    '#mpOnline .ol-board{display:flex;flex-direction:column;gap:10px;flex:0 1 auto;min-height:0}',
    '#mpOnline .ol-bh{position:relative;isolation:isolate;align-self:flex-start;flex:none;display:flex;align-items:center;flex-wrap:wrap;gap:3px 10px;margin:2px 0 0 4px;padding:7px 18px 7px 14px;',
    'font:400 clamp(12px,2vh,15px)/1.1 var(--sp-pop);letter-spacing:.04em;text-transform:uppercase;color:var(--sp-cream);text-shadow:none;transform:rotate(-1.5deg)}',
    '#mpOnline .ol-bh::before{content:"";position:absolute;inset:0 -4px;z-index:-1;background:var(--sp-ink);-webkit-mask:var(--sp-brush) center/100% 100% no-repeat;mask:var(--sp-brush) center/100% 100% no-repeat}',
    '#mpOnline .ol-live{width:10px;height:10px;border-radius:50%;background:#ff3b5c;box-shadow:0 0 0 2px var(--sp-cream);animation:olLive 1.8s ease-out infinite}',
    '@keyframes olLive{50%{transform:scale(.7)}}',
    '#mpOnline .ol-n{color:var(--sp-gold)}',
    '#mpOnline .ol-rec{font:700 clamp(11px,1.8vh,13px)/1.1 var(--sp-ui);letter-spacing:.02em;text-transform:none;color:rgba(255,244,220,.8)}#mpOnline .ol-rec b{font-weight:800;color:var(--sp-gold)}',
    // la cartelera: un brochazo por sala (se desplaza por dentro)
    '#mpOnline .ol-rooms{display:flex;flex-direction:column;gap:clamp(10px,2vh,16px);padding:6px 16px 14px 8px;margin:-6px -16px -14px -8px}',
    '#mpOnline .ol-fx{--sp-h:clamp(60px,10.5vh,78px);--sp-cs:clamp(34px,6.2vh,48px);flex:none}',
    '#mpOnline .ol-fx .sp-tk-main{gap:3px;padding:clamp(8px,1.5vh,12px) 8px clamp(4px,.8vh,7px)}',
    '#mpOnline .fx-chips .fx-vchip{display:none}',
    '#mpOnline .fx-k{display:flex;align-items:center;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#mpOnline .ol-sep{display:inline-block;flex:none;width:5px;height:5px;margin:0 .55em;border-radius:50%;background:currentColor;opacity:.7}',
    '#mpOnline .fx-line{display:flex;align-items:center;gap:8px;min-width:0}',
    '#mpOnline .fx-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:400 clamp(16px,3.1vh,25px)/1.12 var(--sp-pop);letter-spacing:.01em;text-transform:uppercase;color:var(--sp-ink);transform:rotate(-1.5deg);transform-origin:0 60%;padding:1px 2px}',
    '#mpOnline .fx-vs{flex:none;font:400 11px/1 var(--sp-pop);font-style:normal;padding:4px 5px 3px;border-radius:9px 7px 10px 8px;background:var(--sp-ink);color:var(--sp-gold);transform:rotate(-6deg)}',
    '#mpOnline .fx-slot{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:24px;padding:0 7px;box-sizing:border-box;border:2px dashed rgba(21,16,42,.55);border-radius:12px;',
    'font:400 15px/1 var(--sp-pop);color:rgba(21,16,42,.6)}',
    '#mpOnline .fx-slot.in{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 2px var(--sp-ink);font-size:12.5px;text-transform:uppercase}',
    '#mpOnline .fx-chips{display:flex;gap:6px;min-width:0;overflow:hidden}',
    '#mpOnline .fx-chips i{flex:none;font:700 clamp(10px,1.65vh,12.5px)/1 var(--sp-ui);font-style:normal;padding:3px 7px;border-radius:6px 8px 6px 7px;background:rgba(21,16,42,.15);color:var(--sp-ink);white-space:nowrap}',
    '#mpOnline .fx-end{flex:none;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:5px;padding:0 clamp(14px,2.6vh,22px) 0 6px}',
    '#mpOnline .fx-st{display:inline-flex;align-items:center;gap:6px;font:800 clamp(10px,1.6vh,12px)/1 var(--sp-ui);letter-spacing:.06em;text-transform:uppercase;color:var(--sp-ink);white-space:nowrap}',
    '#mpOnline .fx-st::before{content:"";width:9px;height:9px;border-radius:50%;background:#33d17a;box-shadow:0 0 0 2px var(--sp-ink)}',
    '#mpOnline .fx-st.st-full::before{background:#ff8a3d}#mpOnline .fx-st.st-ver::before{background:#9b93c4}',
    '#mpOnline .fx-go{display:inline-flex;align-items:center;gap:5px;padding:6px 10px 5px 12px;border-radius:10px 14px 9px 13px/12px 9px 13px 10px;background:var(--sp-ink);color:var(--sp-cream);',
    'font:400 clamp(12px,2vh,15px)/1 var(--sp-pop);letter-spacing:.03em;text-transform:uppercase;transform:rotate(-3deg);transition:background .12s,color .12s}',
    '#mpOnline .fx-go svg{width:.85em;height:.85em;fill:var(--sp-gold)}',
    '#mpOnline .ol-fx:is(.kf,:focus-visible) .fx-go,#mpOnline .ol-fx:hover .fx-go{background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 2px var(--sp-ink)}',
    '#mpOnline .ol-fx:is(.kf,:focus-visible) .fx-go svg,#mpOnline .ol-fx:hover .fx-go svg{fill:var(--sp-ink)}',
    '#mpOnline .ol-fx .sp-crest svg{fill:var(--sp-ink)}',
    P + '#mpOnline .ol-fx.fx-new:not(.kf):not(:focus-visible){animation:olIn .4s var(--ease) both}',
    '@keyframes olIn{from{opacity:0;translate:-26px 0}to{opacity:1;translate:0 0}}',
    // sin salas: pegatina de papel cosida con «? vs ?»
    '#mpOnline .ol-empty{display:flex;align-items:center;gap:16px;flex:none;margin:4px 8px 6px 4px;padding:14px 18px;border-radius:14px 18px 12px 20px/16px 12px 18px 14px;background:var(--sp-cream);color:var(--sp-ink);',
    'box-shadow:0 0 0 3px var(--sp-ink),5px 6px 0 3px var(--sp-ink);outline:2px dashed rgba(21,16,42,.28);outline-offset:-9px;font:700 clamp(13px,2.2vh,16px)/1.3 var(--sp-ui);transform:rotate(-.6deg)}',
    '#mpOnline .ol-ghost{flex:none;display:flex;align-items:center;gap:6px;font:400 22px/1 var(--sp-pop);color:var(--sp-ink)}',
    '#mpOnline .ol-ghost i{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:2.5px dashed rgba(21,16,42,.5);border-radius:50%;font-style:normal;color:rgba(21,16,42,.55)}',
    '#mpOnline .ol-ghost em{font:400 12px/1 var(--sp-pop);font-style:normal;padding:4px 5px 3px;border-radius:9px;background:var(--sp-ink);color:var(--sp-gold);transform:rotate(-6deg)}',
    // (Online V2) «Precisa (v1)» / «Fluida (v2)»: la v en minúscula y más suave
    '#mpOnline .mv-val .sl-ver{text-transform:none;font-style:normal;opacity:.7}',
    '#mpOnline .ol-hint{display:none}',
    '#spToasts .sp-toast.ol-tbad{padding-left:20px;box-shadow:0 0 0 2.5px var(--sp-cream),inset 7px 0 0 var(--sp-danger),3px 4px 0 2.5px var(--sp-ink)}',   // (móvil: la explicación de la fila elegida, debajo de su rótulo)
    // escribir el nombre y el código: campo crema con contorno de tinta y aro dorado al enfocar
    '#mpOnline .ol-edit{display:flex;gap:14px;align-items:center;flex:none;padding:4px 8px 6px 4px}' + P + '#mpOnline .ol-edit .sp-btn{flex:none}',
    '#mpOnline .ol-edit input{flex:1;min-width:0;height:clamp(46px,8vh,56px);box-sizing:border-box;padding:0 16px;border:0;border-radius:12px 16px 12px 18px/16px 12px 18px 12px;background:var(--sp-cream);color:var(--sp-ink);',
    'box-shadow:0 0 0 3px var(--sp-ink),4px 5px 0 3px var(--sp-ink);font:700 clamp(17px,3vh,21px) var(--sp-ui);outline:none;transition:box-shadow .12s}',
    '#mpOnline .ol-edit input::placeholder{color:rgba(21,16,42,.32)}',
    '#app #mpOnline .ol-edit input:focus{outline:none;box-shadow:0 0 0 3px var(--sp-ink),0 0 0 7px var(--sp-gold),5px 7px 0 7px var(--sp-ink)}',
    '#mpOnline .ol-edit input.code{letter-spacing:.32em;text-transform:uppercase;font-family:var(--sp-pop);font-weight:400}',
    // hojas: avisos sin cuenta / sin servidor / sin WebRTC
    '#mpOnline .ol-card{flex:0 1 auto;min-height:0;overflow-y:auto;padding:14px 18px 16px;margin:0 8px 6px 2px}',
    '#mpOnline .ol-card h3{margin:0 0 8px;font:400 clamp(17px,3.3vh,26px)/1.1 var(--sp-pop);letter-spacing:.01em;text-transform:uppercase;color:var(--sp-gold);text-shadow:2px 2px 0 var(--sp-ink);transform:rotate(-1.5deg);transform-origin:0 50%}',
    '#mpOnline .ol-card p{margin:0;font:500 clamp(13px,2.2vh,15px)/1.45 var(--sp-ui);color:rgba(255,244,220,.92)}',
    '#mpOnline .ol-ctas{display:flex;gap:14px;flex:none;padding:2px 4px 6px}',
    // teclado en pantalla (mando): hoja de tinta con teclas crema
    '#mpOnline .ol-osk{display:flex;flex-direction:column;gap:6px;flex:none;padding:10px 12px 12px;margin:0 8px 6px 2px}',
    '#mpOnline .osk-show{display:flex;align-items:center;gap:10px;min-width:0;padding:0 2px 4px}',
    '#mpOnline .osk-lbl{flex:none;font:400 12px/1 var(--sp-pop);letter-spacing:.06em;text-transform:uppercase;color:var(--sp-gold)}',
    '#mpOnline .osk-val{flex:1 1 auto;min-width:0;display:flex;align-items:center;height:36px;padding:0 12px;overflow:hidden;white-space:pre;border-radius:9px 12px 9px 11px;background:var(--sp-cream);color:var(--sp-ink);',
    'box-shadow:0 0 0 2.5px var(--sp-ink);font:700 20px/1 var(--sp-ui)}#mpOnline .ol-osk.code .osk-val{letter-spacing:.3em;font-family:var(--sp-pop);font-weight:400}',
    '#mpOnline .osk-car{display:inline-block;width:3px;height:22px;margin-left:2px;border-radius:2px;background:var(--sp-kit);animation:oskCar 1s steps(1) infinite}@keyframes oskCar{50%{opacity:0}}',
    '#mpOnline .osk-tip{flex:none;font:600 12px/1 var(--sp-ui);color:rgba(255,244,220,.75)}',
    '#mpOnline .osk-row{display:flex;gap:6px}',
    P + '#mpOnline .osk-k{flex:1 1 0;min-width:0;height:38px;min-height:0;padding:0;margin:0;border:0;border-radius:8px 10px 8px 9px/9px 8px 10px 8px;background:var(--sp-cream);color:var(--sp-ink);',
    'box-shadow:0 0 0 2px var(--sp-ink),2px 3px 0 2px var(--sp-ink);font:400 18px/1 var(--sp-pop);letter-spacing:0;text-transform:none;text-shadow:none;outline:none;transform:none;transition:transform .1s var(--ease)}',
    P + '#mpOnline .osk-k.fn{font-size:13px;letter-spacing:.04em;text-transform:uppercase}' + P + '#mpOnline .osk-k.w{flex:2.4 1 0}',
    P + '#mpOnline .osk-k.ok{background:var(--sp-kit);color:var(--sp-kit-ink);text-shadow:var(--sp-kit-ts)}',
    P + '#mpOnline .osk-k:is(.kf,:focus-visible){background:var(--sp-gold);color:var(--sp-ink);text-shadow:none;outline:none;transform:translateY(-2px) scale(1.06);box-shadow:0 0 0 2px var(--sp-ink),0 0 0 5px var(--sp-cream),2px 4px 0 5px var(--sp-ink)}',
    // crear sala: vista previa (así sale en la lista) y los selectores (pegatinas de tinta con ‹ valor ›, los de Partido rápido)
    '#mpOnline .ol-mk{display:flex;flex-direction:column;gap:10px;flex:0 1 auto;min-height:0}',
    '#mpOnline .mk-top{display:flex;align-items:center;gap:10px;flex:none;margin:0 4px}',
    '#mpOnline .mk-top small{font:700 clamp(11px,1.8vh,13px)/1.2 var(--sp-ui);color:rgba(255,244,220,.85);text-shadow:0 1px 2px rgba(21,16,42,.9),1px 1px 0 var(--sp-ink)}',
    '#mpOnline .mk-prev{flex:none;pointer-events:none;padding:0 10px 0 2px}',
    '#mpOnline .mk-sels{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--sp-gap,10px) clamp(12px,1.6vw,18px);padding:6px 14px 12px 6px;margin:-6px -14px -12px -6px}',
    '#mpOnline .mk-tip{flex:none;margin:0 4px;font:600 clamp(11px,1.8vh,13px)/1.35 var(--sp-ui);color:rgba(255,244,220,.85);text-shadow:0 1px 2px rgba(21,16,42,.9),1px 1px 0 var(--sp-ink)}',
    '#mpOnline .ol-sel{--sp-oh:clamp(52px,9.5vh,76px)}',
    '#mpOnline .mk-sels>.ol-sel:last-child:nth-child(odd){grid-column:1/-1}',
    // «Cómo funciona»: una hoja con una fila por punto (dt dorado, dd crema) y costura discontinua entre filas
    '#mpOnline .ol-help{display:flex;flex-direction:column;gap:10px;flex:0 1 auto;min-height:0}',
    '#mpOnline dl.hp-box{display:block;margin:0 8px 6px 2px;padding:4px 6px}',
    '#mpOnline .hp-box>div{display:grid;grid-template-columns:clamp(92px,22%,128px) minmax(0,1fr);gap:12px;align-items:baseline;padding:8px 10px;border-bottom:2px dashed rgba(255,244,220,.16)}',
    '#mpOnline .hp-box>div:last-child{border-bottom:0}',
    '#mpOnline .hp-box dt{font:400 clamp(11px,1.9vh,14px)/1.3 var(--sp-pop);letter-spacing:.03em;text-transform:uppercase;color:var(--sp-gold);transform:rotate(-2deg);transform-origin:0 50%}',
    '#mpOnline .hp-box dd{margin:0;font:500 clamp(12px,2vh,14.5px)/1.42 var(--sp-ui);color:rgba(255,244,220,.94)}',
    // sala de espera: hoja con la sede, tú VS rival (el VS en pegatina dorada), el código en etiqueta dorada y el estado
    '#mpOnline .ol-match{flex:0 1 auto;min-height:0;overflow-y:auto;margin:0 8px 6px 2px;padding:0 0 12px}',
    '#mpOnline .mt-top{display:flex;align-items:center;gap:10px;padding:10px 14px 9px;border-bottom:2px dashed rgba(255,244,220,.16)}',
    '#mpOnline .mt-top .sp-crest{--sp-cs:clamp(28px,5vh,36px)}#mpOnline .mt-top .sp-crest svg{fill:var(--sp-ink)}',
    '#mpOnline .mt-ven{display:flex;flex-direction:column;gap:2px;min-width:0}#mpOnline .mt-ven b{font:400 clamp(14px,2.4vh,18px)/1 var(--sp-pop);letter-spacing:.02em;text-transform:uppercase;color:var(--sp-cream)}',
    '#mpOnline .mt-ven small{font:600 12px/1.1 var(--sp-ui);color:rgba(255,244,220,.72);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#mpOnline .mt-who{margin-left:auto;font:700 12px/1.1 var(--sp-ui);color:rgba(255,244,220,.75);white-space:nowrap}',
    P + '#mpOnline .ol-code{--sp-chs:clamp(13px,2.3vh,17px);letter-spacing:.2em;padding:5px 7px 4px 10px}',
    '#mpOnline .ol-vs{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px;margin:clamp(10px,2.4vh,18px) 16px clamp(8px,1.8vh,12px)}',
    '#mpOnline .ol-p{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;text-align:center}',
    '#mpOnline .ol-p small{display:flex;align-items:center;gap:5px;font:800 11px/1 var(--sp-ui);letter-spacing:.14em;text-transform:uppercase;color:var(--sp-gold)}',
    '#mpOnline .ol-p .ar{font-size:10px;color:var(--sp-cream)}',
    '#mpOnline .ol-p b{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:400 clamp(20px,4.6vh,38px)/1.08 var(--sp-pop);letter-spacing:.01em;text-transform:uppercase;color:var(--sp-cream);',
    'text-shadow:2px 0 0 var(--sp-ink),-2px 0 0 var(--sp-ink),0 2px 0 var(--sp-ink),0 -2px 0 var(--sp-ink),3px 4px 0 var(--sp-ink);transform:rotate(-2deg);padding:2px 4px 4px}',
    '#mpOnline .ol-p.riv b{animation:olRiv .42s var(--ease) both}@keyframes olRiv{from{opacity:0;transform:rotate(-2deg) scale(1.3)}to{opacity:1;transform:rotate(-2deg)}}',
    '#mpOnline .ol-p.wait b{display:flex;align-items:center;gap:8px;text-shadow:none;transform:none}',
    '#mpOnline .ol-p.wait .ol-q{display:inline-flex;align-items:center;justify-content:center;width:clamp(34px,6vh,48px);height:clamp(34px,6vh,48px);border:3px dashed rgba(255,244,220,.45);border-radius:50%;font:400 clamp(18px,3.4vh,26px)/1 var(--sp-pop);color:rgba(255,244,220,.6)}',
    '#mpOnline .ol-dots{display:flex;gap:4px}#mpOnline .ol-dots i{width:8px;height:8px;border-radius:50%;background:var(--sp-gold);box-shadow:0 0 0 1.5px var(--sp-ink);animation:olDot 1.2s ease-in-out infinite}',
    '#mpOnline .ol-dots i:nth-child(2){animation-delay:.2s}#mpOnline .ol-dots i:nth-child(3){animation-delay:.4s}@keyframes olDot{0%,80%,100%{opacity:.25;transform:none}40%{opacity:1;transform:translateY(-4px)}}',
    '#mpOnline .ol-mid{display:flex;align-items:center;justify-content:center;width:clamp(38px,7vh,54px);height:clamp(38px,7vh,54px);border-radius:50%;background:var(--sp-gold);color:var(--sp-ink);',
    'box-shadow:0 0 0 3px var(--sp-ink),3px 4px 0 3px var(--sp-ink);font:400 clamp(15px,2.8vh,21px)/1 var(--sp-pop);transform:rotate(-10deg)}',
    '#mpOnline .mt-chips{display:flex;justify-content:center;flex-wrap:wrap;gap:6px;margin:0 14px}#mpOnline .mt-chips i{background:rgba(255,244,220,.13);color:var(--sp-cream)}',
    '#mpOnline .ol-st{margin:10px 16px 0;text-align:center;font:700 clamp(13px,2.2vh,15px)/1.4 var(--sp-ui);color:var(--sp-gold)}#mpOnline .ol-st.bad{color:#ffa3ad}',
    '#mpOnline .ol-tip{margin:6px 16px 0;text-align:center;font:500 clamp(11.5px,1.9vh,13px)/1.4 var(--sp-ui);color:rgba(255,244,220,.75)}',
    // — móvil (.ph) — (18-nov-2026, spec «Online»; notes/splat.md «Móvil»). Sustituye a las viejas @media de 430/340 px de alto.
    // PP = prefijo del móvil (:root.ph + 3 ids: gana a P + #mpOnline). La página: cabecera de 48 (Volver, título y tu nombre), UNA zona
    // que se desplaza y la barra de abajo (.ol-dock: la principal, la última, abajo a la derecha). Letra por ancho (--ph-*), nunca vh.
    PP + '#menu.sp-full #mpOnline{left:var(--ph-g);right:auto;width:min(var(--ph-ffw),860px);max-width:none;top:0;bottom:0;padding:var(--ph-gt) 0 var(--ph-gb);gap:0;justify-content:flex-start}',
    PP + '#menu.sp-full #mpOnline>.mp-head{flex:none;min-height:var(--ph-hh);margin:0 0 var(--ph-s2);gap:var(--ph-s3);padding-right:4px;box-sizing:border-box}',
    PP + '#mpOnline .mp-head .sp-k{display:none}' + PP + '#mpOnline .mp-head .mp-tt{flex:none}' + PP + '#mpOnline .mp-head .sp-h{white-space:nowrap}',
    '#mpOnline .ol-hr{display:none}',
    PP + '#mpOnline .ol-hr{display:flex;align-items:center;gap:var(--ph-hit-gap);min-width:0;flex:1 1 auto}',
    // (R2-13) lista: tras «Online», el rótulo vivo «● 4 salas abiertas» (brochazo de tinta); a la derecha tu nombre y el «?» redondo de 44
    PP + '#mpOnline .ol-hsal{position:relative;isolation:isolate;flex:none;display:inline-flex;align-items:center;gap:7px;padding:7px 14px 7px 11px;white-space:nowrap;overflow:hidden;',
    'font:400 var(--ph-label)/1.1 var(--sp-pop);letter-spacing:.04em;text-transform:uppercase;color:var(--sp-cream);transform:rotate(-1.5deg)}',
    PP + '#mpOnline .ol-hsal::before{content:"";position:absolute;inset:0;z-index:-1;background:var(--sp-ink);-webkit-mask:var(--sp-brush) center/100% 100% no-repeat;mask:var(--sp-brush) center/100% 100% no-repeat}',
    PP + '#mpOnline .ol-hsal .ol-live{flex:none}' + PP + '#mpOnline .ol-hsal b{font-weight:400;color:var(--sp-gold)}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-hx{display:none}',
    PP + '#mpOnline .ol-hsal+.ol-who{margin-left:auto}',
    PP + '#mpOnline .ol-hq{flex:none;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;min-width:44px;margin:0 0 0 4px;padding:0 0 2px;box-sizing:border-box;border:0;border-radius:50%;',
    'background:var(--sp-gold);color:var(--sp-ink);box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink);font:400 24px/1 var(--sp-pop);text-shadow:none;cursor:pointer;rotate:-6deg;-webkit-tap-highlight-color:transparent}',
    PP + '#mpOnline .ol-hq:is(.kf,:focus-visible){outline:none;background:var(--sp-cream);box-shadow:0 0 0 2.5px var(--sp-ink),0 0 0 6px var(--sp-gold),2px 3px 0 6px var(--sp-ink)}',
    PP + '#mpOnline .ol-hq:active{translate:1px 2px}',
    ':root.ph:has(#mpOnline:not([hidden]) .ol-hsal)' + P.slice(5) + '#spToasts{top:calc(var(--ph-gt) + 58px)}',   // (los avisos, bajo tu nombre y el «?», sin taparlos)
    PP + '#mpOnline .ol-recl{display:block;flex:none;margin:2px 4px 0 10px;font:700 var(--ph-cap)/1.3 var(--sp-ui);color:rgba(255,244,220,.85);text-shadow:0 1px 2px rgba(21,16,42,.9),1px 1px 0 var(--sp-ink)}',
    PP + '#mpOnline .ol-who{display:inline-flex;align-items:center;gap:8px;min-width:0;max-width:100%;min-height:44px;margin:0;padding:4px 12px 4px 10px;box-sizing:border-box;border:0;border-radius:12px 16px 12px 18px/14px 12px 18px 12px;',
    'background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink);text-align:left;text-transform:none;letter-spacing:0;text-shadow:none;cursor:pointer;rotate:-1.2deg;-webkit-tap-highlight-color:transparent}',
    PP + '#mpOnline .ol-who .ow-t{display:flex;flex-direction:column;min-width:0}',
    PP + '#mpOnline .ol-who small{font:700 var(--ph-cap)/1.1 var(--sp-ui);color:rgba(21,16,42,.66)}',
    PP + '#mpOnline .ol-who b{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere;font:800 var(--ph-row)/1.12 var(--sp-ui)}',
    PP + '#mpOnline .ol-who svg{flex:none;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}',
    PP + '#mpOnline .ol-who:is(.kf,:focus-visible){outline:none;background:var(--sp-gold);box-shadow:0 0 0 2.5px var(--sp-ink),0 0 0 6px var(--sp-cream),2px 3px 0 6px var(--sp-ink)}',
    PP + '#mpOnline .ol-who:active{translate:1px 2px}',
    PP + '#mpOnline .ol-hchip{flex:none;--sp-chs:var(--ph-label)}',
    // el cuerpo: sin desplazamiento propio (lo hace la zona .ol-scroll de cada vista) y la barra de abajo
    PP + '#mpOnline .ol-body{flex:1 1 auto;min-height:0;margin:0;padding:0;overflow:visible;display:flex;flex-direction:column;gap:var(--ph-s2);position:relative}',
    PP + '#mpOnline .ol-scroll{scroll-padding:12px}',
    PP + '#mpOnline .ol-scroll.sp-more{-webkit-mask:linear-gradient(#000 calc(100% - 24px),transparent);mask:linear-gradient(#000 calc(100% - 24px),transparent)}',
    PP + '#mpOnline .ol-scroll.sp-less{-webkit-mask:linear-gradient(transparent,#000 16px);mask:linear-gradient(transparent,#000 16px)}',
    PP + '#mpOnline .ol-scroll.sp-more.sp-less{-webkit-mask:linear-gradient(transparent,#000 16px,#000 calc(100% - 24px),transparent);mask:linear-gradient(transparent,#000 16px,#000 calc(100% - 24px),transparent)}',
    PP + '#mpOnline .ol-dock{flex:none;display:flex;flex-wrap:nowrap;justify-content:flex-end;align-items:center;gap:var(--ph-hit-gap);min-width:0;margin:0;padding:2px 4px 2px 2px}',
    PP + '#mpOnline .ol-dock .ol-act{--sp-h:48px;--sp-fs:var(--ph-btn);--sp-px:16px;flex:0 1 auto;min-width:0}',
    PP + '#mpOnline .ol-dock .ol-act.ol-new{--sp-h:56px;--sp-fs:calc(var(--ph-btn) + 2px);--sp-px:22px}',
    PP + '#mpOnline .ol-dock .ol-act.ol-ico{--sp-px:0;width:48px;flex:none}',
    PP + '#mpOnline .ol-dock>.sp-dock-l{margin-right:auto}',
    PP + '#mpOnline .ol-dock .ol-act .sp-t{overflow:visible}',
    PP + '#mpOnline .ol-note{margin:0 4px;font-size:var(--ph-body);line-height:1.35}',
    // lista: la cartelera ocupa el alto y se desplaza; «Salas abiertas · 4» pegado arriba; ancho ≥ 800: barra a la derecha (en columna)
    PP + '#mpOnline .ol-body[data-v="list"] .ol-rooms{flex:1 1 auto;min-height:0;gap:12px;padding:4px 12px 20px 4px;margin:0 -12px 0 -4px}',
    PP + '#mpOnline .ol-rooms>.ol-bh{flex:none;margin:2px 0 0 12px;align-self:flex-start}',
    PP + '#mpOnline .ol-bh .ol-live{display:inline-block;vertical-align:middle;margin:-2px 8px 0 0}' + PP + '#mpOnline .ol-bh .ol-n{color:var(--sp-gold)}' + PP + '#mpOnline .ol-bh .ol-rec{font-size:var(--ph-cap);margin-left:4px}',
    PP + '#mpOnline .ol-bh .ol-srch{display:inline-flex;align-items:center;gap:6px;font:700 var(--ph-cap)/1 var(--sp-ui);letter-spacing:0;text-transform:none;color:rgba(255,244,220,.85)}',
    PW + '#mpOnline .ol-body[data-v="list"]{display:grid;grid-template-columns:minmax(0,1fr) clamp(212px,26vw,240px);grid-template-rows:minmax(0,1fr);column-gap:var(--ph-s4)}',
    PW + '#mpOnline .ol-body[data-v="list"] .ol-rooms{grid-column:1;grid-row:1}',
    PW + '#mpOnline .ol-body[data-v="list"] .ol-dock{grid-column:2;grid-row:1;flex-direction:column;align-items:stretch;justify-content:flex-end;gap:16px;padding:4px 6px 4px 2px}',
    PW + '#mpOnline .ol-body[data-v="list"] .ol-dock .ol-act{width:100%;flex:none;--sp-px:14px}',
    PW + '#mpOnline .ol-body[data-v="list"] .ol-dock .ol-act.ol-ico{width:48px;align-self:flex-end}',
    // las salas (brochazos): ≥ 60 px, nombre a --ph-head, una línea de chips, estado con punto y «Entrar» en pegatina dorada de 44
    PP + '#mpOnline .ol-fx{--sp-h:68px;--sp-cs:clamp(32px,2.6vw + 17px,40px);flex:none}',
    PP + '#mpOnline .ol-fx .fx-k{display:none}',
    PP + '#mpOnline .ol-fx .sp-tk-main{gap:5px;padding:6px 8px 6px 6px}',
    PP + '#mpOnline .fx-line{gap:8px}',
    PP + '#mpOnline .fx-name{font-size:var(--ph-head);line-height:1.06;white-space:normal;text-overflow:clip;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:normal}',
    PP + '#mpOnline .mk-prev .fx-name{font-size:var(--ph-row);display:block;white-space:nowrap}' + PP + '#mpOnline .mk-prev .fx-line{flex-wrap:wrap;row-gap:4px}' + PP + '#mpOnline .mk-prev .fx-chips .fx-vchip{display:none}' + PP + '#mpOnline .mk-prev .fx-chips{flex-wrap:wrap;row-gap:4px}',
    // (la sede ya sale en el subtítulo del parche; el billete de muestra crece con su contenido: nada recortado arriba)
    PP + '#mpOnline .mk-prev .ol-fx{--sp-h:auto}' + PP + '#mpOnline .mk-prev .ol-fx .sp-tk-main{padding-top:14px;padding-bottom:10px}',
    PP + '#mpOnline .mk-prev .fx-end{display:none}' + PP + '#mpOnline .mk-prev .fx-line{flex-wrap:nowrap}' + PP + '#mpOnline .mk-prev .fx-name{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}',
    PP + '#mpOnline .fx-vs{font-size:var(--ph-cap);padding:4px 6px 3px}',
    PP + '#mpOnline .fx-slot{height:28px;min-width:34px;font-size:var(--ph-row)}',
    PP + '#mpOnline .fx-slot.in{max-width:none;flex:0 1 auto;min-width:0;text-overflow:clip;font-size:var(--ph-cap);padding:0 9px}',
    PP + '#mpOnline .fx-chips{gap:6px;flex-wrap:nowrap}',
    PP + '#mpOnline .fx-chips i{font-size:var(--ph-cap);line-height:1.1;padding:3px 8px}',
    PP + '#mpOnline .fx-chips .fx-vchip{display:block;flex:0 1 auto;min-width:0;max-width:15em;overflow:hidden;text-overflow:ellipsis}',
    PP + '#mpOnline .fx-end{gap:4px;padding:0 12px 0 6px}',
    PP + '#mpOnline .fx-end .fx-st:not(:only-child){display:none}' + PP + '#mpOnline .fx-st{font-size:var(--ph-cap);letter-spacing:0;text-transform:none;font-weight:700}',
    PP + '#mpOnline .fx-go{min-height:44px;box-sizing:border-box;padding:0 14px 0 16px;border-radius:12px 16px 11px 15px/14px 11px 16px 12px;background:var(--sp-gold);color:var(--sp-ink);',
    'box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink);font-size:var(--ph-btn);letter-spacing:.02em;transform:rotate(-2deg)}',
    PP + '#mpOnline .fx-go svg{fill:var(--sp-ink)}',
    PP + '#mpOnline .ol-fx:is(.kf,:focus-visible) .fx-go{background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink)}',
    PP + '#mpOnline .ol-fx:is(.kf,:focus-visible) .fx-go svg{fill:var(--sp-ink)}',
    PP + '#mpOnline .ol-empty{margin:4px 10px 6px 6px;padding:14px 18px;font-size:var(--ph-body)}',
    // escribir tu nombre o el código: hoja pegada arriba (con el teclado del móvil, VB.Splat.kbd la sube), campo de 52 y «Guardar» al lado
    PP + '#mpOnline .ol-edit{position:absolute;left:2px;right:6px;top:0;z-index:6;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"l x" "f f";gap:4px 10px;align-items:center;padding:8px 10px 14px 16px;margin:0}',
    PP + '#mpOnline .ol-edit.kb-pin{top:calc(-1 * var(--ph-hh) - var(--ph-s2))!important}',   // (teclado abierto: sube por encima de la cabecera)
    PP + '#mpOnline .ol-edit .oe-l{grid-area:l;font:400 var(--ph-label)/1.1 var(--sp-pop);letter-spacing:.04em;text-transform:uppercase;color:var(--sp-gold)}',
    PP + '#mpOnline .ol-edit .sp-x{grid-area:x}',
    PP + '#mpOnline .ol-edit .oe-f{grid-area:f;display:flex;align-items:center;gap:12px;min-width:0}',
    PP + '#mpOnline .ol-edit input{flex:1 1 auto;min-width:0;height:52px;font-size:20px}',
    PP + '#mpOnline .ol-edit .sp-btn{--sp-h:52px;--sp-fs:var(--ph-btn);flex:none}',
    // teclado en pantalla (mando)
    PP + '#mpOnline .ol-osk{flex:1 1 auto;min-height:0;gap:5px;padding:8px 10px 10px;margin:0 4px 0 2px}',
    PP + '#mpOnline .osk-val{height:36px;font-size:20px}' + PP + '#mpOnline .osk-lbl{font-size:var(--ph-label)}' + PP + '#mpOnline .osk-tip{display:none}',
    PP + '#mpOnline .osk-k{height:34px;font-size:18px}' + PP + '#mpOnline .osk-k.fn{font-size:13px;letter-spacing:.02em}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .osk-k{height:30px}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .osk-val{height:30px}',
    // «Cómo funciona»: páginas de dos puntos (titular a --ph-head, texto a --ph-body), puntitos y «Siguiente ›» / «Entendido» abajo
    PP + '#mpOnline .hp-go{margin-top:auto}' + PP + '#mpOnline .ol-hpp{flex:0 1 auto;min-height:0;display:block;margin:0 4px 0 2px;padding:4px 18px}',
    PP + '#mpOnline .hp-pt{padding:10px 0 11px;border-bottom:2px dashed rgba(255,244,220,.16)}' + PP + '#mpOnline .hp-pt:last-child{border-bottom:0}',
    PP + '#mpOnline .hp-pt h4{margin:0 0 4px;font:400 var(--ph-head)/1.1 var(--sp-pop);letter-spacing:.01em;text-transform:none;color:var(--sp-gold);text-shadow:2px 2px 0 var(--sp-ink);transform:rotate(-1deg);transform-origin:0 50%}',
    PP + '#mpOnline .hp-pt p{margin:0;font:500 var(--ph-body)/1.4 var(--sp-ui);color:rgba(255,244,220,.94)}',
    PP + '#mpOnline .hp-dots{display:flex;align-items:center;gap:8px;margin-right:auto;padding:0 0 0 8px}',
    PP + '#mpOnline .hp-dots i{width:10px;height:10px;border-radius:50%;background:rgba(255,244,220,.4);box-shadow:0 0 0 2px var(--sp-ink)}',
    PP + '#mpOnline .hp-dots i.on{width:24px;border-radius:6px;background:var(--sp-gold)}',
    // crear sala: filas de opciones (rótulo a la izquierda, ‹ valor › a la derecha) que se desplazan, y «Abrir sala» abajo a la derecha.
    // ≥ 720 px de ancho: filas a la izquierda (58 %) y a la derecha tu sala tal y como sale en la lista, la explicación y el parche
    PP + '#mpOnline .ol-body[data-v="create"]{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;row-gap:var(--ph-s2);--ol-vw:clamp(150px,28vw,230px)}',
    PP + '#mpOnline .ol-body[data-v="create"] .ol-mk{display:contents}',
    PP + '#mpOnline .ol-body[data-v="create"] :is(.mk-top,.mk-prev,.mk-tip){display:none}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-sels{grid-column:1;grid-row:1;display:flex;flex-direction:column;gap:10px;min-height:0;padding:4px 12px 12px 4px;margin:0 -12px 0 -4px}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-go{grid-column:1;grid-row:2}',
    PP + '#mpOnline .mk-go .sp-patch{flex:0 1 auto;width:auto;min-width:min(240px,100%)}',
    PP + '#mpOnline .mk-go .sp-patch .sp-s{font-size:var(--ph-cap)}',
    '@media (min-width:720px){',
    PP + '#mpOnline .ol-body[data-v="create"]{grid-template-columns:minmax(0,58fr) minmax(0,42fr);grid-template-rows:auto auto minmax(0,1fr) auto;column-gap:var(--ph-s4);--ol-vw:clamp(132px,19vw,178px)}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-sels{grid-row:1/-1}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-top{display:flex;grid-column:2;grid-row:1;margin:2px 0 0}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-prev{display:block;grid-column:2;grid-row:2;padding:6px 6px 2px 2px}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-tip{display:block;grid-column:2;grid-row:3;align-self:start;margin-top:8px}',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-go{grid-column:2;grid-row:4}',
    PP + '#mpOnline .mk-go .sp-patch{width:100%}}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-body[data-v="create"] .mk-prev{display:none}',
    PP + '#mpOnline .mk-top small{font-size:var(--ph-cap)}',
    PP + '#mpOnline .mk-tip{margin:4px 2px 0;padding:8px 12px;border-radius:12px 16px 11px 15px/14px 11px 16px 12px;background:rgba(21,16,42,.84);box-shadow:0 0 0 2px rgba(255,244,220,.12);',
    'font:500 var(--ph-body)/1.38 var(--sp-ui);color:rgba(255,244,220,.94);text-shadow:none}',
    PP + '#menu #mpOnline .ol-sel{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto;grid-template-areas:"l v";align-items:center;justify-items:stretch;width:100%;height:auto;min-height:54px;',
    'padding:4px 4px 4px 16px;gap:0 8px;text-align:left;white-space:normal;--sp-aw:34px;flex:none}',
    PP + '#menu #mpOnline .ol-sel .mi-l{grid-area:l;display:flex;flex-direction:column;align-items:flex-start;justify-self:start;min-width:0;max-width:100%;margin:0;padding:0;',
    'font:400 var(--ph-label)/1.12 var(--sp-pop);letter-spacing:.04em;text-transform:uppercase;color:var(--sp-gold);text-align:left;transform:rotate(-1deg)}',
    PP + '#menu #mpOnline .ol-sel{--sp-tilt:.25deg;margin:0}' + PP + '#menu #mpOnline .ol-sel:nth-child(odd){--sp-tilt:-.25deg}' + PP + '#mpOnline .ol-fx{--sp-tilt:-.3deg}' + PP + '#mpOnline .ol-fx:nth-child(odd){--sp-tilt:.3deg}',
    PP + '#menu #mpOnline .ol-sel .mi-v{grid-area:v;display:flex;align-items:center;gap:0}',
    PP + '#menu #mpOnline .ol-sel .arr{grid-area:auto}',
    PP + '#menu #mpOnline .ol-sel .mv-val{width:var(--ol-vw);max-width:none;min-width:0;box-sizing:border-box;margin:0;padding:5px 10px;transform:rotate(-1.4deg)}',
    PP + '#menu #mpOnline .ol-sel:nth-child(even) .mv-val{transform:rotate(1.1deg)}',
    PP + '#menu #mpOnline .ol-sel:nth-child(3n+2) .mv-val::before{background:#8ee8d9}',
    PP + '#menu #mpOnline .ol-sel:nth-child(3n) .mv-val::before{background:var(--sp-cream)}',
    PP + '#menu #mpOnline .ol-sel .mv-val b{white-space:normal;overflow:visible;text-overflow:clip;text-align:center;line-height:1.05;overflow-wrap:break-word}',
    PP + '#menu #mpOnline .ol-sel .ol-hint{display:none;margin:3px 0 0;font:600 var(--ph-label)/1.22 var(--sp-ui);letter-spacing:0;text-transform:none;color:rgba(255,244,220,.84);white-space:normal}',
    PP + '#menu #mpOnline .ol-sel:is(:focus,.kf,.ol-on) .ol-hint{display:block}',
    // MV-8: en el móvil, sin brochazo (se deshilachaba y el rótulo quedaba encima de la pista): pegatina de tinta maciza como .sp-li
    // (relleno, perfil de tinta y sombra dura), de 460 como mucho, rótulo y ‹ valor › juntos (12 px)
    PP + '#menu #mpOnline .ol-sel{width:min(100%,460px);gap:0 12px;padding:4px 6px 4px 16px;background:var(--sp-ink2);border-radius:12px 16px 11px 15px/14px 11px 16px 12px;',
    'box-shadow:0 0 0 3px var(--sp-ink),3px 4px 0 3px var(--sp-ink)}',
    PP + '#menu #mpOnline .ol-sel>.sp-blob{display:none}',
    PP + '#menu #mpOnline .ol-sel:is(.kf,:focus-visible){box-shadow:0 0 0 3px var(--sp-ink),0 0 0 6px var(--sp-gold),3px 5px 0 6px var(--sp-ink)}',
    PP + '#menu #mpOnline .ol-sel:is(:active,.sp-press):not(:disabled){box-shadow:0 0 0 3px var(--sp-ink),1px 1px 0 3px var(--sp-ink)}',
    PP + '#menu #mpOnline .ol-sel:disabled{filter:grayscale(.9) brightness(.72)}',
    // sala de espera: cartel a todo lo ancho (sede, código que se copia al tocarlo, TÚ VS RIVAL en grande, chips, estado y las 3 reglas)
    PP + '#mpOnline .ol-body[data-v="room"] .ol-match{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow-y:auto;margin:0 4px 0 2px;padding:0 0 12px}',
    PP + '#mpOnline .mt-top{flex:none;min-height:56px;box-sizing:border-box;gap:10px;padding:6px 8px 6px 12px}',
    PP + '#mpOnline .mt-ven{flex:1 1 auto;min-width:0}',
    PP + '#mpOnline .mt-ven b{font:700 var(--ph-body)/1.2 var(--sp-ui);letter-spacing:0;text-transform:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    PP + '#mpOnline .mt-who{font-size:var(--ph-label);margin-left:0}',
    PP + '#mpOnline .ol-code{--sp-chs:var(--ph-head);display:inline-flex;align-items:center;gap:8px;min-height:44px;box-sizing:border-box;margin:0 4px 0 0;padding:0 12px 0 14px;border:0;letter-spacing:.16em;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    PP + '#mpOnline .ol-code svg{flex:none;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}',
    PP + '#mpOnline .ol-code:is(.kf,:focus-visible){outline:none;background:var(--sp-cream);box-shadow:0 0 0 2.5px var(--sp-ink),0 0 0 6px var(--sp-gold)}',
    PP + '#mpOnline .ol-code:active{translate:1px 2px}',
    PP + '#mpOnline .ol-vs{margin:12px 12px 6px;gap:10px}',
    PP + '#mpOnline .ol-p{gap:4px}' + PP + '#mpOnline .ol-p small{font-size:var(--ph-label);letter-spacing:.04em}' + PP + '#mpOnline .ol-p .ar{font-size:var(--ph-cap)}',
    PP + '#mpOnline .ol-p b{font-size:var(--ph-title);line-height:1.02;white-space:normal;text-overflow:clip;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}',
    PP + '#mpOnline .ol-p.wait b{display:flex}' + PP + '#mpOnline .ol-p.wait .ol-q{width:44px;height:44px;font-size:22px}',
    PP + '#mpOnline .ol-mid{width:48px;height:48px;font-size:20px}',
    PP + '#mpOnline .mt-chips{margin:0 12px}' + PP + '#mpOnline .mt-chips i{font-size:var(--ph-cap);padding:3px 8px}',
    PP + '#mpOnline .ol-st{margin:8px 12px 0;font-size:var(--ph-row);line-height:1.3}',
    // MV-7: el estado fijo (sobre la pista) va en una pegatina de tinta, como el «Lo intentamos otra vez» de los avisos
    PP + '#mpOnline .ol-st-pin{flex:none;align-self:center;box-sizing:border-box;max-width:calc(100% - 16px);margin:0 8px;padding:6px 14px;opacity:1;white-space:normal;text-wrap:balance;text-align:center;',
    'border-radius:8px 11px 8px 10px;background:var(--sp-ink);box-shadow:0 0 0 2px rgba(255,244,220,.14),2px 3px 0 2px var(--sp-ink);text-shadow:none}',
    // 568×320 (.ph-s): el VS en una línea por nombre para que quepan los chips y las reglas (y la pegatina del estado, más justa)
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-st-pin{margin-top:-4px;padding:3px 12px;line-height:1.2}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-vs{margin:2px 12px 0}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-p{gap:2px}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-p b{display:block;font-size:var(--ph-head);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;-webkit-line-clamp:none}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-p.wait b{display:flex}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-mid{width:40px;height:40px;font-size:17px}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-p.wait .ol-q{box-sizing:border-box;width:34px;height:34px;font-size:17px}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .mt-top{min-height:46px;padding-top:1px;padding-bottom:1px}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-p.wait b{line-height:1;min-height:0;padding:0}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-body[data-v="room"] .ol-match{padding-bottom:4px}' + PP + '#mpOnline .ol-match>*{flex-shrink:0}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-rules{margin-top:4px}',
    PP + '#mpOnline .ol-tip{display:none}',
    '#mpOnline .ol-rules{display:none}',
    PP + '#mpOnline .ol-rules{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin:10px 12px 0}',
    PP + '#mpOnline .ol-rules i{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px 11px 8px 10px;background:rgba(255,244,220,.12);color:var(--sp-cream);font:700 var(--ph-cap)/1.1 var(--sp-ui);font-style:normal}',
    PP + '#mpOnline .ol-rules svg{flex:none;width:15px;height:15px;fill:none;stroke:var(--sp-gold);stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}',
    // avisos (sin cuenta, sin servidor, sin WebRTC): una hoja centrada, titular a --ph-head, texto a --ph-body, el botón abajo a la derecha
    PP + '#mpOnline .ol-body:is([data-v="noacc"],[data-v="off"],[data-v="nortc"]){justify-content:center;align-items:center;padding-bottom:var(--ph-s5)}',
    PP + '#mpOnline .ol-card{flex:none;width:min(100%,600px);box-sizing:border-box;margin:0;padding:16px 20px 18px;overflow:visible}',
    PP + '#mpOnline .ol-card h3{margin:0 0 6px;font-size:var(--ph-head)}',
    PP + '#mpOnline .ol-card p{font-size:var(--ph-body);line-height:1.4}',
    PP + '#mpOnline .ol-retry{display:inline-flex;align-items:center;gap:8px;margin:12px 0 0;padding:5px 12px;border-radius:8px 11px 8px 10px;background:rgba(255,244,220,.12);color:var(--sp-cream);font:700 var(--ph-cap)/1.15 var(--sp-ui)}',
    PP + '#mpOnline .ol-retry::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--sp-gold);animation:olLive 1.8s ease-out infinite}',
    PP + '#mpOnline .ol-ctas{width:min(100%,600px);justify-content:flex-end;margin:var(--ph-s3) 0 0;padding:0}',
    PP + '#mpOnline .ol-ctas .sp-btn{--sp-h:56px;--sp-fs:calc(var(--ph-btn) + 2px);--sp-px:24px;width:auto;flex:none}',
    PP + '#mpOnline .ol-ctas .sp-s{display:none}',
    // movil-aire §5.1 (paquete menús, 24-nov-2026): lista con CÓDIGO / CREAR SALA en una columna de 150 a la derecha también a 568; sala de 56 en
    // una fila (sede 36 · nombre · «Platja Llarga · 1 set a 21» · ENTRAR 44); las no disponibles, oscuras al 55 %; «Juegas como» = ficha de 44
    PP + '#mpOnline .ol-body[data-v="list"]{display:grid;grid-template-columns:minmax(0,1fr) 150px;grid-template-rows:minmax(0,1fr);column-gap:12px}',
    PP + '#mpOnline .ol-body[data-v="list"] .ol-rooms{grid-column:1;grid-row:1}',
    PP + '#mpOnline .ol-body[data-v="list"] .ol-dock{grid-column:2;grid-row:1;flex-direction:column;align-items:stretch;justify-content:flex-end;gap:14px;padding:4px 4px 4px 2px}',
    PP + '#mpOnline .ol-body[data-v="list"] .ol-dock .ol-act{width:100%;flex:none;--sp-px:10px}',
    PP + '#mpOnline .ol-body[data-v="list"] .ol-dock .ol-act.ol-new{--sp-h:56px;--sp-fs:var(--ph-btn);--sp-px:10px}',
    PP + '#mpOnline .ol-fx{--sp-h:56px;--sp-cs:36px}',
    PP + '#mpOnline .ol-fx .sp-tk-main{gap:2px;padding:4px 8px 4px 4px}',
    PP + '#mpOnline .ol-fx .fx-line{gap:6px}',
    PP + '#mpOnline .ol-fx:not(.fx-prev) :is(.fx-vs,.fx-slot:not(.in)){display:none}',
    PP + '#mpOnline .ol-fx .fx-name{font-size:var(--ph-row);line-height:1.1;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;-webkit-line-clamp:none}',
    PP + '#mpOnline .ol-fx .fx-chips{gap:0;overflow:hidden;white-space:nowrap}',
    PP + '#mpOnline .ol-fx .fx-chips i{background:none;padding:0;border-radius:0;font-size:var(--ph-label);font-weight:600;line-height:1.2;color:inherit;opacity:.88}',
    PP + '#mpOnline .ol-fx .fx-chips i:nth-child(n+3){display:none}',
    PP + '#mpOnline .ol-fx .fx-chips i+i::before{content:",";margin:0 5px 0 0}',
    PP + '#mpOnline .ol-fx .fx-chips .fx-vchip{max-width:11em}',
    PP + '#mpOnline .ol-fx .fx-go{min-height:44px;padding:0 10px 0 12px}',
    PP + '#mpOnline .ol-fx.fx-off{--sp-c:var(--sp-ink2);--sp-d:var(--sp-ink2);--sp-tc:var(--sp-cream);color:var(--sp-cream)}' + PP + '#mpOnline .ol-fx.fx-off>.sp-tk{opacity:.55}',
    // (ronda final: lo no disponible se sigue leyendo —.8—; «+ Crear sala» en una línea también a 568)
    PP + '#mpOnline .ol-fx.fx-off>.sp-tk{opacity:.82}',
    // (ronda 2, recortes: la sala no disponible, atenuada pero LEGIBLE —el nombre iba en tinta sobre tinta—, con su estado «Llena» /
    //  «Otra versión» a la derecha, y vuelve la chapa «Igualado» —3.ª ficha— que la ronda 1 escondía)
    PP + '#mpOnline .ol-fx.fx-off .fx-name{color:var(--sp-cream)}',
    PP + '#mpOnline .ol-fx.fx-off .fx-end .fx-st{display:inline-flex;color:var(--sp-cream);font-size:var(--ph-cap)}',
    PP + '#mpOnline .ol-fx .fx-chips i:nth-child(3){display:inline}',
    // (las fichas parten de línea si no caben —la sala crece—: ni la sede ni «Con sus atributos» se cortan)
    PP + '#mpOnline .ol-rooms .ol-fx:not(.fx-prev){--sp-h:auto;min-height:56px}',
    // (en fichas con fondo y sin «·»: al partir de línea no queda un separador huérfano delante; el nombre, con aire arriba)
    PP + '#mpOnline .ol-fx .fx-chips{flex-wrap:wrap;gap:3px 6px;white-space:normal;overflow:visible}',
    PP + '#mpOnline .ol-fx .fx-chips i{white-space:nowrap;padding:1px 7px;border-radius:6px;background:rgba(21,16,42,.12)}',
    ':root.ph:not(#_):not(#_):not(#_):not(#_) #mpOnline .ol-fx .fx-chips i+i::before{content:none}',
    PP + '#mpOnline .ol-fx.fx-off .fx-chips i{background:rgba(255,244,220,.1)}',
    PP + '#mpOnline .ol-rooms .ol-fx:not(.fx-prev) .sp-tk-main{padding-top:8px;padding-bottom:8px}',
    PP + '#mpOnline .ol-fx .fx-chips .fx-vchip{max-width:none;overflow:visible;text-overflow:clip}',

    PP + '#mpOnline .ol-body[data-v="list"] .ol-dock .ol-act .sp-t{white-space:nowrap}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-body[data-v="list"] .ol-dock .ol-act.ol-new{--sp-fs:var(--ph-label);--sp-px:8px}',
    PP + '#mpOnline .mk-prev .fx-chips i+i::before{content:none}' + PW + '#mpOnline .mk-go .sp-patch .sp-t{font-size:22px;white-space:nowrap}',
    PP + '#mpOnline .ol-who{height:44px;min-height:44px;padding:0 12px 0 14px}',
    PP + '#mpOnline .ol-who small{display:none}',
    PP + '#mpOnline .ol-who b{display:block;max-width:9.5em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:var(--ph-label)}',
    // Crear sala: rejilla de 2 de selectores (rótulo encima, ‹ valor › debajo; 72 de alto, 64 en .ph-s): a 568 se ven 5; vista previa fuera
    // hasta 800 y de 260 desde 800
    PP + '#mpOnline .ol-body[data-v="create"] .mk-sels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-content:start}',
    PP + '#menu #mpOnline .ol-sel{width:100%;min-height:72px;grid-template-columns:minmax(0,1fr);grid-template-areas:"l" "v";justify-items:stretch;padding:6px 6px 4px;gap:2px 0}',
    PP + '#menu #mpOnline .ol-sel .mi-l{justify-self:center;align-items:center;text-align:center}',
    PP + '#menu #mpOnline .ol-sel .mi-v{width:100%;justify-content:space-between}',
    PP + '#menu #mpOnline .ol-sel .mv-val{width:auto;flex:1 1 auto;min-width:0}',
    PP + '#menu #mpOnline .ol-sel .mv-val b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    PP + '#menu #mpOnline .ol-sel:is(.kf,.ol-on,:focus) .ol-hint{display:none}',
    // (1.24.0) filas de alto propio: «Formato» con su «Beta» y «Escenario» con la nota del 6v6 ocupan dos líneas y las flechas se salían
    //  sobre la fila de abajo (min-height:72 fijaba la fila de la rejilla a 72)
    PP + '#mpOnline .ol-body[data-v="create"] .mk-sels{grid-auto-rows:max-content}',
    ':root.ph.ph-s' + P.slice(5) + '#menu #mpOnline .ol-sel{min-height:58px;padding:2px 6px 1px;gap:0}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-body[data-v="create"] .mk-sels{gap:10px 12px;padding-top:2px}',
    ':root.ph.ph-s' + P.slice(5) + '#menu #mpOnline .ol-sel .mi-l{line-height:1.05}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .mk-go .sp-patch{--sp-ph:var(--ph-cta-h)}',
    '@media (min-width:720px){',
    PP + '#mpOnline .ol-body[data-v="create"] .mk-prev{display:none}',
    '}',
    PW + '#mpOnline .ol-body[data-v="create"]{grid-template-columns:minmax(0,1fr) 260px}',
    PW + '#mpOnline .ol-body[data-v="create"] .mk-prev{display:block}',
    // Cómo funciona: a 844+ los puntos de la página en 2 columnas; «Siguiente» de 52. Avisos: el botón dentro de la hoja. Sala: reglas en una fila
    PW + '#mpOnline .ol-hpp{columns:2;column-gap:24px}',
    PW + '#mpOnline .hp-pt{break-inside:avoid}',
    PP + '#mpOnline .hp-go .ol-act.ol-new{--sp-h:52px}',
    PP + '#mpOnline .ol-card{width:min(100%,var(--ph-fw))}',
    PP + '#mpOnline .ol-card .ol-ctas{width:auto;display:flex;justify-content:flex-end;margin:14px 0 0}',
    PP + '#mpOnline .ol-card .ol-ctas .sp-btn{--sp-h:48px;--sp-fs:var(--ph-btn)}',
    PP + '#mpOnline .ol-rules{flex-wrap:nowrap;gap:8px}',
    PP + '#mpOnline .ol-rules i{font-size:var(--ph-label);white-space:nowrap}',
    // vertical (teléfono de pie): columna a todo lo ancho, cabecera arriba y el lobby abajo; barra en dos filas
    '@media (max-aspect-ratio:5/4){',
    '#mpOnline .ol-act{--sp-h:48px;--sp-fs:14px}',
    P + '#mpOnline .ol-bar .ol-act.ol-new{flex:1 1 auto}' + P + '#mpOnline .ol-act.ol-nm{flex:1 1 calc(100% - 140px)}',
    '#mpOnline .ol-fx{--sp-h:68px;--sp-cs:30px}#mpOnline .ol-fx .sp-tk-stub{padding-left:10px}#mpOnline .fx-name{font-size:17px}#mpOnline .fx-slot.in{max-width:62px;font-size:11px}',
    '#mpOnline .fx-chips i{font-size:10px;padding:2px 5px}#mpOnline .fx-end{padding-right:14px}#mpOnline .fx-go{font-size:12px;padding:5px 8px 4px 9px}',
    '#mpOnline .mk-sels{grid-template-columns:minmax(0,1fr);gap:9px}#mpOnline .ol-sel{--sp-oh:54px}',
    '#mpOnline .hp-box>div{display:block;padding:7px 10px}#mpOnline .hp-box dt{display:inline;margin-right:8px;font-size:12px}#mpOnline .hp-box dd{display:inline;font-size:13px;line-height:1.4}',
    '#mpOnline .ol-p b{font-size:22px;white-space:normal;overflow-wrap:anywhere;text-overflow:clip;line-height:1.05}#mpOnline .mt-top{flex-wrap:wrap;row-gap:6px}',
    '#mpOnline .ol-bar2{flex-wrap:wrap}' + P + '#mpOnline .ol-bar2 .sp-btn{flex:1 1 auto}' + PP + '#mpOnline .mx-dock .mx-st-dock{flex:1 1 100%;order:-1}}',
    '@media (max-width:400px) and (max-aspect-ratio:5/4){#mpOnline .ol-fx .sp-tk-stub{display:none}#mpOnline .fx-main{padding-left:14px}}',
    // — online de varios (sprint online-multi, P6) —
    // lista: «3/4» en vez del hueco «?»; crear sala: las filas fijas por el formato enseñan siempre su explicación
    '#mpOnline .fx-slot.fx-cnt{border-style:solid;font-size:14px;letter-spacing:.02em}',
    '#mpOnline .ol-sel.ol-lock{opacity:.78}' + PP + '#menu #mpOnline .ol-sel.ol-lock .ol-hint{display:block}',
    // «Beta» del 6 contra 6 (lane A): la pegatina del botón Online del menú (.sp-chip dorada, girada) en la esquina del brochazo y junto
    // al rótulo «Formato»; sin pulsarse (aria-hidden: el aria de la sala y de la fila ya dicen «beta»)
    P + '#mpOnline .ol-fx .ol-beta{position:absolute;right:12px;top:-7px;z-index:3;--sp-tilt:7deg;pointer-events:none}',
    P + '#mpOnline .ol-sel .ol-beta2{margin-left:6px;--sp-tilt:-4deg;vertical-align:.1em;pointer-events:none}',
    // sala de espera: dos columnas de sitios (una por equipo, con el color de su camiseta en --tk); en cada una, sitios de 44 de alto
    // en rejilla (2 por fila en 568×320: los 12 del 6v6 caben con poco desplazamiento dentro de la hoja)
    '#mpOnline .mx-teams{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,218px),1fr));gap:10px 12px;margin:10px 12px 4px}',
    '#mpOnline .mx-team{display:flex;flex-direction:column;gap:6px;min-width:0;padding:7px 8px 8px;border-radius:12px 16px 11px 15px/14px 11px 16px 12px;background:rgba(255,244,220,.07);box-shadow:inset 0 4px 0 var(--tk)}',
    '#mpOnline .mx-th{display:flex;align-items:baseline;gap:6px;font:400 var(--ph-label,13px)/1.1 var(--sp-pop);letter-spacing:.04em;text-transform:uppercase;color:var(--sp-cream)}',
    '#mpOnline .mx-th span{font:700 12px/1 var(--sp-ui);letter-spacing:0;color:rgba(255,244,220,.7)}#mpOnline .mx-th i{font:700 12px/1 var(--sp-ui);font-style:normal;letter-spacing:0;text-transform:none;color:var(--sp-gold)}',
    '#mpOnline .mx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));gap:6px}',
    P + '#mpOnline .mx-chip{display:flex;align-items:center;gap:6px;min-width:0;width:auto;height:auto;min-height:44px;margin:0;padding:3px 6px 3px 5px;box-sizing:border-box;border:0;border-radius:10px 13px 9px 12px;',
    'background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 2px var(--sp-ink),inset 5px 0 0 var(--tk);text-align:left;text-transform:none;letter-spacing:0;text-shadow:none;cursor:pointer;font:inherit;outline:none;transform:none;-webkit-tap-highlight-color:transparent}',
    P + '#mpOnline .mx-chip.empty{background:rgba(21,16,42,.55);color:var(--sp-cream);box-shadow:0 0 0 2px rgba(255,244,220,.32),inset 5px 0 0 var(--tk)}',
    P + '#mpOnline .mx-chip.me{background:var(--sp-gold)}' + P + '#mpOnline .mx-chip.conn{opacity:.72}' + P + '#mpOnline .mx-chip:disabled{cursor:default;filter:none;opacity:1}' + P + '#mpOnline .mx-chip.conn:disabled{opacity:.72}',
    P + '#mpOnline .mx-chip.pick{box-shadow:0 0 0 2px var(--sp-ink),0 0 0 5px var(--sp-gold),inset 5px 0 0 var(--tk)}',
    P + '#mpOnline .mx-chip:is(.kf,:focus-visible){box-shadow:0 0 0 2px var(--sp-ink),0 0 0 5px var(--sp-cream),inset 5px 0 0 var(--tk)}',
    P + '#mpOnline .mx-chip:not(:disabled):active{translate:1px 1px}',
    '#mpOnline .mx-num{position:relative;flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:var(--tk);color:#fff;font:400 13px/1 var(--sp-pop);',
    'text-shadow:0 1px 0 rgba(0,0,0,.5);box-shadow:0 0 0 2px var(--sp-ink)}',
    // (listo y ping, pegados al dorsal: el nombre gana el ancho)
    // (L3: el ✓ arriba a la IZQUIERDA del dorsal: a la derecha tapaba la primera letra del nombre)
    '#mpOnline .mx-num .mx-ok{position:absolute;left:-6px;top:-6px}#mpOnline .mx-num .mx-ping{position:absolute;right:-3px;bottom:-3px}',
    '#mpOnline .mx-tx{flex:1 1 auto;display:flex;flex-direction:column;gap:1px;min-width:0}',
    '#mpOnline .mx-tx b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:800 var(--ph-row,14px)/1.15 var(--sp-ui)}',
    '#mpOnline .mx-tx small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 12px/1.15 var(--sp-ui);opacity:.78}#mpOnline .mx-tx em{font-style:normal;font-weight:900;color:#a8143a;opacity:1}',
    '#mpOnline .mx-chip.empty .mx-tx b{font-weight:700;opacity:.8}',
    '#mpOnline .mx-sg{flex:none;display:flex;flex-direction:column;align-items:center;gap:3px}',
    '#mpOnline .mx-ping{display:block;width:9px;height:9px;border-radius:50%;box-shadow:0 0 0 1.5px var(--sp-ink)}#mpOnline .mx-ping.g{background:#33d17a}#mpOnline .mx-ping.y{background:#ffc93d}#mpOnline .mx-ping.r{background:#ff4d5e}',
    '#mpOnline .mx-ok{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#33d17a;color:var(--sp-ink);font:900 12px/1 var(--sp-ui);font-style:normal;text-shadow:none;box-shadow:0 0 0 1.5px var(--sp-ink)}',
    '#mpOnline .mx-bench{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:6px 12px 0;font:700 12px/1.2 var(--sp-ui);color:rgba(255,244,220,.8)}#mpOnline .mx-bench small{font-size:inherit}',
    P + '#mpOnline .mx-bp{display:inline-flex;align-items:center;min-height:30px;margin:0;padding:0 10px;box-sizing:border-box;border:0;border-radius:9px 12px 9px 11px;background:rgba(255,244,220,.14);color:var(--sp-cream);',
    'font:700 13px/1 var(--sp-ui);font-style:normal;text-transform:none;letter-spacing:0;text-shadow:none;box-shadow:none;transform:none}',
    P + '#mpOnline button.mx-bp{min-height:44px;background:var(--sp-cream);color:var(--sp-ink);box-shadow:0 0 0 2px var(--sp-ink);cursor:pointer}' + P + '#mpOnline button.mx-bp.pick{background:var(--sp-gold);box-shadow:0 0 0 2px var(--sp-ink),0 0 0 5px var(--sp-cream)}',
    P + '#mpOnline .mx-swap{flex:none;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;min-height:0;margin:0 0 0 auto;padding:0;border:0;border-radius:12px 15px 11px 14px;background:var(--sp-cream);color:var(--sp-ink);',
    'box-shadow:0 0 0 2.5px var(--sp-ink),2px 3px 0 2.5px var(--sp-ink);cursor:pointer;transform:none;-webkit-tap-highlight-color:transparent}',
    P + '#mpOnline .mx-swap svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}',
    P + '#mpOnline .mx-swap:is(.kf,:focus-visible){outline:none;background:var(--sp-gold);box-shadow:0 0 0 2.5px var(--sp-ink),0 0 0 6px var(--sp-cream)}',
    '#mpOnline .ol-mx .mt-top .ol-code{margin-left:0;min-height:44px;display:inline-flex;align-items:center;gap:8px;border:0;cursor:pointer}#mpOnline .ol-mx .mt-ven{flex:1 1 auto}',
    '#mpOnline .ol-mx .mt-top .ol-code svg{flex:none;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}',
    '#mpOnline .ol-mx .mt-chips i{font-size:12px}',
    PP + '#mpOnline .ol-mx .mt-chips{margin-top:8px}',
    ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-mx .mx-teams{margin:6px 8px 2px;gap:8px}' + ':root.ph.ph-s' + P.slice(5) + '#mpOnline .ol-mx .mx-team{padding:6px 6px 6px}',
    // (L3, móvil) sala de varios: 2 contra 2, un sitio por fila (el nombre entero cabe); 6 contra 6, dos por fila (3 filas por equipo);
    // dentro de cada sitio, si es estrecho (< 140 px: 568×320), el nombre corto. La cabecera lleva el formato, «cambiar de lado» y el
    // código; la barra, el estado entre «Salir» y la principal (dos líneas como mucho)
    PP + '#mpOnline .ol-mx .mx-teams{margin-top:4px}' + PP + '#mpOnline .ol-mx .mx-team{gap:5px}',
    PP + '#mpOnline .ol-mx .mx-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}',
    PP + '#mpOnline .ol-mx:not(.mx6) .mx-grid{grid-template-columns:minmax(0,1fr)}',
    PP + '#mpOnline .mx-chip{container-type:inline-size;padding:3px 5px}',
    '#mpOnline .mx-ns{display:none}',
    '@container (max-width:139px){#mpOnline .mx-nf{display:none}#mpOnline .mx-ns{display:inline}}',
    '#mpOnline .mx-cn{position:absolute;left:-4px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--sp-gold);box-shadow:0 0 0 1.5px var(--sp-ink);animation:olLive 1.8s ease-out infinite}',
    PP + '#mpOnline .mx-info{margin:6px 12px 0;font:700 14px/1.3 var(--sp-ui);color:rgba(255,244,220,.88)}' + PP + '#mpOnline .mx-info b{font-weight:800;color:var(--sp-cream)}',
    PP + '#mpOnline .ol-mx .mt-chips{margin-top:4px}',
    PP + '#mpOnline .mp-head .ol-hcode{margin:0;--sp-chs:var(--ph-label);min-height:44px;padding:0 10px 0 12px;letter-spacing:.14em}' + PP + '#mpOnline .mp-head .mx-swap+.ol-hcode{margin-left:0}',
    PP + '#mpOnline .mp-head .ol-hchip+.ol-hcode{margin-left:auto}',
    PP + '#mpOnline .mx-dock .mx-st-dock{flex:1 1 0;min-width:0;align-self:center;margin:0;padding:0 2px;font:700 14px/1.22 var(--sp-ui);text-align:center;text-wrap:balance;',
    'color:var(--sp-cream);opacity:1;text-shadow:0 1px 2px rgba(21,16,42,.9),1px 1px 0 var(--sp-ink)}',
    PP + '#mpOnline .mx-dock .mx-st-dock.bad{color:#ffb3bc}' + PP + '#mpOnline .mx-dock>.sp-dock-l{margin-right:0}',
    // Carrera cooperativa: hoja propia (encima de lo que haya: la Carrera la abre desde su pantalla)
    '#olCoop{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:max(12px,env(safe-area-inset-top)) 16px max(12px,env(safe-area-inset-bottom));box-sizing:border-box;background:rgba(10,8,24,.6)}',
    '#olCoop[hidden]{display:none}',
    '.oc-under,.oc-under *{pointer-events:none!important}',
    '#olCoop .oc-card{display:flex;flex-direction:column;gap:12px;width:min(100%,500px);max-height:100%;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;padding:16px 18px 18px}',
    '#olCoop h3{margin:0;font:400 clamp(18px,3.4vw + 6px,26px)/1.1 var(--sp-pop);letter-spacing:.01em;text-transform:uppercase;color:var(--sp-gold);text-shadow:2px 2px 0 var(--sp-ink);transform:rotate(-1.5deg);transform-origin:0 50%}',
    '#olCoop .oc-t{margin:0;font:600 clamp(14px,1vw + 11px,16px)/1.4 var(--sp-ui);color:rgba(255,244,220,.94)}#olCoop .oc-t.bad{color:#ffb3bc}',
    '#olCoop .oc-code{align-self:flex-start;display:inline-flex;align-items:center;gap:10px;min-height:48px;margin:0;padding:0 14px 0 16px;border:0;font:400 22px/1 var(--sp-pop);letter-spacing:.22em;cursor:pointer}',
    P + '#olCoop .oc-code.sp-chip{font-size:22px;--sp-chs:22px}',
    '#olCoop .oc-code svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}',
    '#olCoop .oc-bar{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:12px 14px;margin-top:2px}',
    P + '#olCoop .oc-bar .sp-btn{--sp-h:50px;--sp-fs:16px;--sp-px:20px;flex:0 1 auto;width:auto;min-width:0}',
    // menos movimiento (ajuste del juego o del sistema)
    '.rm #mpOnline .ol-fx.fx-new,.rm #mpOnline .ol-p.riv b,.rm #mpOnline .ol-live,.rm #mpOnline .ol-dots i,.rm #mpOnline .ol-act.spin .ol-ic svg,.rm #mpOnline .ol-retry::before{animation:none!important}',
    '@media (prefers-reduced-motion:reduce){#mpOnline .ol-fx.fx-new,#mpOnline .ol-p.riv b,#mpOnline .ol-live,#mpOnline .ol-dots i{animation:none!important}}'
  ].join('');
  function ensureCss() { if (document.getElementById('olCss')) return; var s = document.createElement('style'); s.id = 'olCss'; s.textContent = CSS; document.head.appendChild(s); }
  ensureCss();   // (ya al cargar: la tarjeta de Jugar usa .has-onl / .m-onl antes de abrir el lobby)

  /** Botón de las hojas de aviso (sin cuenta, sin servidor): mancha de pintura del color que toque (SPLAT). */
  function row(a, label, help, right, extra) {
    return '<button class="sp-btn sp-md sp-wide ' + (extra && extra.color || 'sp-kit') + '" data-a="' + a + '" data-shape="' + (extra && extra.shape | 0) + '"' + (extra && extra.dis ? ' disabled' : '') +
      (extra && extra.aria ? ' aria-label="' + esc(extra.aria) + '"' : '') + '><span class="sp-l"><span class="sp-t">' + label + '</span>' + (help ? '<small class="sp-s">' + help + '</small>' : '') + '</span></button>';
  }
  var ARR_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>', ARR_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';
  /* Fase 4: «Cómo funciona» (sale sola la primera vez que se entra en la lista; luego, desde la fila de la lista). Frases cortas,
   * género neutro (notes/ui_main.md «Textos: guía de estilo»). */
  var HELP = [
    ['1 contra 1', 'Cada persona lleva a su n.º 1 y la IA lleva a su pareja. Es 2 contra 2 en la playa o en pista.'],
    ['2 y 6 contra 6', 'En las salas de 2 contra 2 (hasta 4 personas) y de 6 contra 6 (hasta 12, en pista) cada persona lleva un jugador y la IA lleva los sitios libres. Quien crea la sala reparte los sitios y pulsa «Empezar».'],
    ['Tu jugador', 'Juegas con los atributos e insignias de tu jugador de la Carrera (sin Carrera, los de tu n.º 1 de Partido rápido). En una sala «Igualado», nadie lleva atributos ni insignias.'],
    ['Salas', 'Crea una sala y espera a que alguien entre desde la lista, o entra en una sala abierta. También puedes pasar el código de tu sala.'],
    ['Sin pausa', 'No se puede parar el partido. Entre sets hay 10 s de descanso: si tu rival y tú pulsáis «Continuar», se sigue antes.'],
    ['Conexión', 'Quien crea la sala elige. Precisa (v1): los dos veis exactamente lo mismo, con algún tirón si hay mucho ping. Fluida (v2): tu equipo responde al instante y el rival se ve una pizca en diferido.'],
    ['Si se corta', 'El partido espera a tu rival y a los 10 s puedes seguir contra la IA. Tu rival tiene 60 s para volver.'],
    ['Récord', 'Abandonar cuenta como derrota. El online no da experiencia ni insignias; al terminar tu primer partido, la gorra «Estuve en la beta» para el Vestuario.'],
    ['Privacidad', 'El juego solo enseña tu nombre (si no eliges uno, «Jugador» y un número), nunca tu correo. La conexión es directa entre los dos aparatos: como en cualquier juego en línea entre jugadores, el aparato de tu rival conoce tu dirección de red.']
  ];
  /** Pegatina redonda de la sede (sombrilla en la playa, pabellón en pista). */
  var VEN_IC = {
    beach: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2C6.8 3.2 2.9 6.9 2.4 11h19.2C21.1 6.9 17.2 3.2 12 3.2zM11 11.5h2v7.6a2.6 2.6 0 0 1-5.2 0v-.6h2v.6a.6.6 0 0 0 1.2 0z"/></svg>',
    hall: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 8.6V11h20V8.6zM4 12.5h3v6.5H4zm6.5 0h3v6.5h-3zm6.5 0h3v6.5h-3zM2 20h20v2H2z"/></svg>'
  };
  var GO_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>';
  /** Una sala de la cartelera: brochazo (.sp-ticket; turquesa en pista, dorado en la playa) con la pegatina de la sede, quien la creó
   *  VS el hueco, los chips del partido, el estado y «Entrar». o.prev: vista previa de «Crear sala» (no es un botón ni se puede pulsar). */
  function fxHTML(r, o) {
    o = o || {};
    var full = r.state === 'full' || (r.multi && (r.state !== 'open' || r.free <= 0)), off = !o.prev && (r.other || full), beach = r.venue === 'beach', vn = venueName(r), kind = beach ? 'Playa' : 'Pabellón';
    var tag = o.prev ? 'div' : 'button';
    // online de varios: en vez del hueco «?», cuántos hay de cuántos («3/4») y el aria con las plazas libres
    var nIn = r.multi ? 1 + (r.nseat | 0) : 0, freeTxt = r.multi ? (r.free === 1 ? '. 1 plaza libre' : '. ' + (r.free | 0) + ' plazas libres') : '. Una plaza libre';
    // (lane A, 22-nov-2026: el 6 contra 6 lleva la pegatina «Beta», la misma del botón Online del menú, en la esquina del brochazo)
    var beta = !!(r.multi && r.fmt === '6v6');
    return '<' + tag + ' class="ol-fx sp-ticket sp-calm sp-noshine ' + (beach ? 'sp-gold v-beach' : 'v-hall') + (o.isNew ? ' fx-new' : '') + (off ? ' fx-off' : '') + (o.prev ? ' fx-prev' : '') + '"' +
      ' data-shape="' + (o.idx | 0) + '"' +
      (o.prev ? '' : ' data-a="join" data-id="' + esc(r.id) + '"' + (off || L.busy ? ' disabled' : '') +
        ' aria-label="' + esc('Sala de ' + r.name + '. ' + cfgParts(r).join(', ') + (beta ? '. Beta' : '') + (r.other ? '. Otra versión del juego' : full ? '. Llena' : freeTxt)) + '"') +
      (o.isNew ? ' style="animation-delay:' + (o.delay | 0) + 'ms"' : '') + '><span class="sp-tk">' +
      '<span class="sp-tk-stub"><span class="sp-crest" aria-hidden="true">' + VEN_IC[beach ? 'beach' : 'hall'] + '</span></span>' +
      '<span class="sp-tk-main fx-main"><small class="sp-k fx-k">' + kind + (vn && vn !== kind ? ', ' + esc(vn) : '') + '</small>' +
      '<span class="fx-line"><b class="fx-name" title="' + esc(r.name) + '">' + esc(r.name) + '</b><i class="fx-vs">VS</i>' +
      (r.multi ? '<span class="fx-slot fx-cnt' + (full ? ' in' : '') + '" aria-hidden="true">' + nIn + '/' + (r.cap | 0) + '</span></span>'
        : '<span class="fx-slot' + (full ? ' in' : '') + '">' + (full ? esc(r.gname || 'Rival') : '?') + '</span></span>') +
      '<span class="fx-chips">' + (vn && vn !== kind ? '<i class="fx-vchip" data-ph-ell aria-hidden="true">' + esc(String(vn).replace(/^(Poliesportiu|Polideportivo|Pabellón|Pavelló)\s+/, '')) + '</i>' : '') + chipsHTML(r) + '</span></span>' +
      '<span class="fx-end"><span class="fx-st ' + (r.other ? 'st-ver' : full ? 'st-full' : 'st-open') + '">' + (r.other ? 'Otra versión' : full ? 'Llena' : 'Abierta') + '</span>' +
      (off || o.prev ? '' : '<span class="fx-go">Entrar' + GO_IC + '</span>') + '</span></span>' + (beta ? '<i class="sp-chip ol-beta" aria-hidden="true">Beta</i>' : '') + '</' + tag + '>';
  }
  /** Selector de «Crear sala»: la pegatina de tinta de Partido rápido (.sp-opt: rótulo dorado y ‹ valor › en trazo dorado entre flechas
   *  crema de 44 px). ↑↓ elige, ←→ o las flechas cambian (netlobby side / onClick con .arr). */
  function selRow(k, label, val, hint, n, dis, beta) {   // (dis: fila fija por el formato, p. ej. el 6 contra 6 siempre en Pabellón; beta: pegatina «Beta»)
    return '<button class="ol-sel sp-btn sp-ink sp-wide sp-opt sp-calm' + (L.lastSel === k ? ' ol-on' : '') + (dis ? ' ol-lock' : '') + '" data-ol="' + k + '" data-shape="' + (n | 0) + '"' + (dis ? ' disabled' : '') + ' aria-label="' + esc(label + ': ' + val + (beta ? ' (beta)' : '') + '. ' + hint) + '">' +
      '<span class="mi-l">' + esc(label) + (beta ? ' <i class="sp-chip ol-beta2" aria-hidden="true">Beta</i>' : '') + '<small class="ol-hint" aria-hidden="true">' + esc(hint) + '</small></span><span class="mi-v sp-select"><span class="arr" data-d="-1">' + ARR_L + '</span>' +
      '<span class="mv-val"><b>' + esc(val).replace(/ \((v\d)\)$/,' <i class="sl-ver">($1)</i>') + '</b></span><span class="arr" data-d="1">' + ARR_R + '</span></span></button>';
  }
  /* Móvil (spec «Online»): los mismos puntos en frases de 2 líneas como mucho, «Sin pausa» el segundo, y en páginas de dos (puntitos y
   * «Siguiente ›» abajo; en la última, «Entendido»). El texto largo de PC (HELP) no cambia. */
  var HELP_PH = [
    ['1 contra 1', 'Cada persona lleva a su n.º 1 y la IA a su pareja: 2 contra 2, en la playa o en pista.'],
    ['Sin pausa', 'El partido no se para. Entre sets hay 10 s de descanso (si los dos pulsáis «Continuar», se sigue antes).'],
    ['2 y 6 contra 6', 'Cada persona lleva un jugador y la IA, los sitios libres. Quien crea la sala reparte y pulsa «Empezar».'],
    ['Tu jugador', 'Juegas con los atributos e insignias de tu jugador de la Carrera (o de tu n.º 1). En «Igualado», nadie los lleva.'],
    ['Salas', 'Crea una sala y espera a que alguien entre, o entra en una de la lista. También puedes pasar tu código.'],
    ['Conexión', 'Quien crea la sala elige. Precisa (v1): los dos veis lo mismo. Fluida (v2): tu equipo responde al instante.'],
    ['Si se corta', 'El partido espera a tu rival; a los 10 s puedes seguir contra la IA. Tu rival tiene 60 s para volver.'],
    ['Récord', 'Abandonar cuenta como derrota. Sin experiencia ni insignias; tu primer partido da la gorra «Estuve en la beta».'],
    ['Privacidad', 'Solo se ve tu nombre (o «Jugador» y un número), nunca tu correo. La conexión es directa: el aparato de tu rival conoce tu dirección de red.']
  ];
  var HP_PER = 2;   // (3 con ancho ≥ 800: html.ph-w)
  function hpPer() { return document.documentElement.classList.contains('ph-w') ? 3 : HP_PER; }
  function hpPages() { return Math.ceil(HELP_PH.length / hpPer()); }
  function helpHTML() {
    if (ph()) {
      var pg = Math.max(0, Math.min(hpPages() - 1, L.hpPage | 0));
      return '<div class="ol-hpp sp-panel ol-scroll" role="group" aria-label="Cómo funciona el online, ' + (pg + 1) + ' de ' + hpPages() + '">' +
        HELP_PH.slice(pg * hpPer(), pg * hpPer() + hpPer()).map(function (x) { return '<div class="hp-pt"><h4>' + esc(x[0]) + '</h4><p>' + esc(x[1]) + '</p></div>'; }).join('') + '</div>';
    }
    // (SPLAT) rótulo en trazo de tinta y una hoja (.sp-panel) con una fila por punto; la hoja se desplaza por dentro y «Entendido» queda fuera
    return '<div class="ol-help"><h3 class="ol-bh">Cómo funciona el online</h3><dl class="hp-box sp-panel ol-scroll">' +
      HELP.map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>'; }).join('') + '</dl></div>';
  }
  function svg(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>'; }
  var IC = {
    plus: svg('M12 5v14M5 12h14'), hash: svg('M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16'), pen: svg('M4 20l1-4L16 5l3 3L8 19zM14 7l3 3'),
    ref: svg('M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4'), copy: svg('M8 8h11v11H8zM5 16V5h11'), out: svg('M14 5h5v14h-5M10 8l-4 4 4 4M6 12h10'),
    // (móvil) compartir, siguiente / anterior, ✕ y las tres reglas de la sala de espera
    share: svg('M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V20h14v-7.5'), next: svg('M9.5 5.5 16 12l-6.5 6.5'), prev: svg('M14.5 5.5 8 12l6.5 6.5'), x: svg('M6.5 6.5l11 11M17.5 6.5l-11 11'),
    nopause: svg('M8 5v14M16 5v14M4 4l16 16'), clock: svg('M12 4a8 8 0 1 0 .01 0zM12 8v4.5l3 2'), flag: svg('M6 21V4M6 4h11l-2.5 4L17 12H6'),
    rep: svg('M12 3.5a8.5 8.5 0 1 0 .01 0zM12 7.5v6M12 16.6v.4')   // («Denunciar nombre»: círculo con exclamación)
  };
  function ic(k) { return '<span class="sp-ic ol-ic">' + IC[k] + '</span>'; }
  /* ---------------- escribir el nombre y el código ----------------
   * Con teclado, ratón o táctil: un <input> como siempre. Si lo último que se ha tocado es un MANDO (ctx.inputDevice === 'gamepad'),
   * un teclado en pantalla: cruceta para moverse (↑↓ entre filas, ←→ dentro de la fila), A escribe, B cancela. Para que ↑↓ de ui.js
   * baje de fila y no de tecla, solo la tecla de la columna actual de cada fila queda sin data-skip (L.osk.col). */
  function padNow() { var C = ctx(); return !!(C && C.inputDevice === 'gamepad'); }
  var OSK_N = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM-._'], OSK_C = ['23456789', 'ABCDEFGHJK', 'MNPQRSTUVW'];
  var OSK_W = 10;   // (columnas de la fila más larga)
  function oskRows() {
    var o = L.osk, code = L.edit === 'code', rows = (code ? OSK_C : OSK_N).map(function (s) {
      return Array.from(s).map(function (c) { var ch = code || o.up ? c : c.toLowerCase(); return { k: 'c' + ch, t: ch }; });
    });
    rows.push(code ? [{ k: 'cX', t: 'X' }, { k: 'cY', t: 'Y' }, { k: 'cZ', t: 'Z' }, { k: 'bs', t: 'Borrar', w: 1 }, { k: 'ok', t: 'Entrar', w: 1 }] :
      [{ k: 'sh', t: o.up ? 'abc' : 'ABC' }, { k: 'sp', t: 'Espacio', w: 1 }, { k: 'bs', t: 'Borrar' }, { k: 'ok', t: 'Guardar', w: 1 }]);
    return rows;
  }
  function oskIdx(len, col) { return len >= OSK_W ? Math.min(col, len - 1) : Math.round(col * (len - 1) / (OSK_W - 1)); }
  function editHTML(nm) {
    var code = L.edit === 'code';
    // (móvil: hoja pegada arriba, rótulo y ✕, y el campo de 52 px con su botón al lado; con el teclado del móvil, VB.Splat.kbd la sube)
    if (!L.osk && ph()) return '<div class="ol-edit sp-panel" data-nav data-kb-pin><span class="oe-l">' + (code ? 'Código de la sala' : 'Tu nombre en el online') + '</span>' +
      '<button class="sp-x" type="button" data-a="editX" aria-label="Cancelar">' + IC.x + '</button><div class="oe-f" data-kb-row>' +
      (code ? '<input id="olIn" class="code" maxlength="7" autocomplete="off" spellcheck="false" aria-label="Código de la sala" placeholder="K7P2QX"><button class="ol-act sp-btn sp-kit" data-shape="1" data-a="codeOk"><span class="sp-t">Entrar</span></button>'
        : '<input id="olIn" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Tu nombre en el online" value="' + esc(typedName()) + '" placeholder="' + esc(defaultName()) + '"><button class="ol-act sp-btn sp-kit" data-shape="1" data-a="nameOk"><span class="sp-t">Guardar</span></button>') + '</div></div>';
    if (!L.osk) {
      if (code) return '<div class="ol-edit"><input id="olIn" class="code" maxlength="7" autocomplete="off" spellcheck="false" aria-label="Código de la sala" placeholder="K7P2QX"><button class="ol-act ol-new sp-btn sp-kit" data-shape="1" data-a="codeOk"><span class="sp-t">Entrar</span></button></div>';
      return '<div class="ol-edit"><input id="olIn" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Tu nombre en el online" value="' + esc(typedName()) + '" placeholder="' + esc(defaultName()) + '"><button class="ol-act ol-new sp-btn sp-kit" data-shape="1" data-a="nameOk"><span class="sp-t">Guardar</span></button></div>';
    }
    var o = L.osk, h = '<div class="ol-osk sp-panel' + (code ? ' code' : '') + '"><div class="osk-show"><span class="osk-lbl">' + (code ? 'Código' : 'Tu nombre') + '</span>' +
      '<b class="osk-val" aria-live="polite">' + esc(o.v) + '<i class="osk-car" aria-hidden="true"></i></b><span class="osk-tip">A escribe. B cancela.</span></div>';
    oskRows().forEach(function (row, ri) {
      var ci = oskIdx(row.length, o.col);
      h += '<div class="osk-row" data-nav>' + row.map(function (x, i) {
        return '<button class="osk-k' + (x.k.charAt(0) === 'c' ? '' : ' fn') + (x.w ? ' w' : '') + (x.k === 'ok' ? ' ok' : '') + '" data-a="osk" data-id="' + esc(x.k) + '" data-r="' + ri + '" data-i="' + i + '"' + (i === ci ? '' : ' data-skip') +
          (x.k === 'sp' ? ' aria-label="Espacio"' : '') + '>' + esc(x.t) + '</button>';
      }).join('') + '</div>';
    });
    return h + '</div>';
  }
  function oskKey(k) {
    var o = L.osk, max = L.edit === 'code' ? 6 : 16; if (!o) return;
    if (k === 'ok') { commitEdit(); return; }
    if (k === 'bs') o.v = Array.from(o.v).slice(0, -1).join('');
    else if (k === 'sh') o.up = !o.up;
    else if (k === 'sp') { if (o.v && !/ $/.test(o.v) && o.v.length < max) o.v += ' '; }
    else if (k.charAt(0) === 'c' && Array.from(o.v).length < max) { o.v += k.slice(1); if (L.edit === 'name' && o.up && o.auto) o.up = false; }
    o.auto = false;
    sound('optChange'); render(true);
  }
  /** ←→ dentro de una fila del teclado en pantalla (o de una barra de acciones). */
  function rowStep(el, d) {
    var par = el.parentNode, bs = Array.prototype.filter.call(par.querySelectorAll('button'), function (b) { return !b.disabled; }), i = bs.indexOf(el);
    if (i < 0 || bs.length < 2) return true;
    var nb = bs[(i + d + bs.length) % bs.length];
    bs.forEach(function (b) { if (b !== nb && par.classList.contains('ol-bar') && !par.classList.contains('ol-bar2')) b.setAttribute('data-skip', ''); });
    nb.removeAttribute('data-skip');
    if (el.classList.contains('osk-k')) {
      var n = bs.length, ni = +nb.getAttribute('data-i');
      L.osk.col = n >= OSK_W ? ni : Math.round(ni * (OSK_W - 1) / (n - 1));
      // (las demás filas: su tecla de la columna nueva queda sin data-skip)
      Array.prototype.forEach.call(L.host.querySelectorAll('.osk-row'), function (r) {
        var ks = r.querySelectorAll('.osk-k'), ci = oskIdx(ks.length, L.osk.col);
        for (var j = 0; j < ks.length; j++) { if (j === ci) ks[j].removeAttribute('data-skip'); else ks[j].setAttribute('data-skip', ''); }
      });
    } else if (par.classList.contains('ol-bar') && !par.classList.contains('ol-bar2')) L.barKey = nb.getAttribute('data-a');
    try { nb.focus(); } catch (e) { }
    var pv = document.querySelectorAll('.kf'); for (var j = 0; j < pv.length; j++) pv[j].classList.remove('kf');
    nb.classList.add('kf'); sound('optHover');
    return true;
  }
  function note() { if (ph() || pvv()) return '';   // (móvil: el aviso va al carril de avisos de arriba, VB.Splat.toast: ver render)
    return L.msg ? '<p class="ol-note' + (L.msgBad ? ' bad' : '') + '" role="status">' + esc(L.msg) + '</p>' : ''; }
  /* ---------------- móvil (html.ph; spec «Online», notes/splat.md «Móvil») ----------------
   * La misma página con otra disposición: en la cabecera, tras «Online», tu nombre en una chapa crema (lista) o en qué paso estás; una
   * sola zona que se desplaza (la cartelera, las filas de Crear sala, la ayuda, el cartel de la sala) y la barra de abajo con la acción
   * principal la última (abajo a la derecha). Los avisos (L.msg) van al carril de arriba (VB.Splat.toast). Mismos data-a y data-ol que
   * en PC: onClick, back(), side() y las pruebas no cambian. */
  function headHTML() {
    var v = L.view;
    if (v === 'list' && !L.osk) {
      // (R2-13: «Salas abiertas · 4» y el «?» suben a la cabecera; la cartelera gana la fila del rótulo)
      var nm = myName(), n0 = L.rooms.length, srch0 = (L.loading && !L.listAt) || (L.listAt && !n0);
      return '<span class="ol-hsal" role="status"><span class="ol-live" aria-hidden="true"></span>' +
        (L.listAt && n0 ? '<b class="ol-n">' + n0 + '</b> ' + (n0 === 1 ? 'sala' : 'salas') + '<span class="ol-hx"> ' + (n0 === 1 ? 'abierta' : 'abiertas') + '</span>'
          : srch0 ? 'Buscando…' : 'Salas') + '</span>' +
        '<button class="ol-who" type="button" data-a="name" aria-label="' + esc('Tu nombre: ' + nm + '. Cambiar') + '"><span class="ow-t"><small>Juegas como</small><b>' + esc(nm) + '</b></span>' + IC.pen + '</button>' +
        '<button class="ol-hq" type="button" data-a="help" aria-label="Cómo funciona">?</button>';
    }
    if (v === 'room' && L.mx && L.room) return mHeadHTML();   // (sala de varios: formato, cambiar de lado y código arriba)
    var t = v === 'help' ? 'Cómo funciona' : v === 'create' ? 'Nueva sala' : v === 'room' && L.room ? 'Sala de espera' : '';
    return t ? '<i class="sp-chip ol-hchip">' + t + '</i>' : '';
  }
  function viewPH() {
    var v = L.view, h = '';
    if (v === 'noacc') {
      // (movil-aire §5.1: el botón dentro de la hoja, bajo el texto; una sola pieza centrada)
      h = '<div class="ol-card sp-panel"><h3>Necesitas una cuenta para jugar online</h3><p>Entra con tu cuenta (o créala, es gratis) y vuelve aquí. Tu rival solo verá tu nombre.</p>' +
        '<div class="ol-ctas" data-nav>' + row('acc', 'Ir a Cuenta', '', '', { color: 'sp-kit', shape: 0 }) + '</div></div>';
    } else if (v === 'off') {
      h = '<div class="ol-card sp-panel"><h3>El online aún no está activado</h3><p>Todavía no se puede jugar online desde el servidor. Vuelve a probar dentro de un rato.</p>' +
        '<span class="ol-retry" role="status">Lo intentamos otra vez en 30 s</span>' +
        '<div class="ol-ctas" data-nav>' + row('retry', 'Volver a probar', '', '', { color: 'sp-gold', shape: 1 }) + '</div></div>';
    } else if (v === 'nortc') {
      // (con «Copiar enlace»: para abrir el juego en el otro navegador sin teclear la dirección)
      h = '<div class="ol-card sp-panel"><h3>Este navegador no puede jugar online</h3><p>Prueba con una versión reciente de Chrome, Edge, Firefox o Safari (en el iPhone, sin el modo Aislamiento).</p>' +
        '<div class="ol-ctas" data-nav>' + row('copylink', 'Copiar enlace', '', '', { color: 'sp-gold', shape: 1 }) + '</div></div>';
    } else if (v === 'help') {
      var pg = Math.max(0, Math.min(hpPages() - 1, L.hpPage | 0)), last = pg >= hpPages() - 1, dots = '';
      for (var d = 0; d < hpPages(); d++) dots += '<i' + (d === pg ? ' class="on"' : '') + '></i>';
      h = helpHTML() + '<div class="ol-bar ol-bar2 ol-dock hp-go" data-nav><span class="hp-dots" aria-hidden="true">' + dots + '</span>' +
        (pg > 0 ? '<button class="ol-act ol-ico sp-btn sp-ink sp-sq" data-shape="1" data-a="helpPrev" aria-label="Anterior">' + ic('prev') + '</button>' : '') +
        (last ? '<button class="ol-act ol-new sp-btn sp-gold" data-shape="2" data-a="helpOk"><span class="sp-t">Entendido</span></button>'
          : '<button class="ol-act ol-new sp-btn sp-gold" data-shape="2" data-a="helpNext"><span class="sp-t">Siguiente</span>' + ic('next') + '</button>') + '</div>';
    } else if (v === 'list') {
      if (L.osk) return editHTML(myName());   // (teclado en pantalla del mando: ocupa la página entera)
      var rl = VB.NetRec ? safe(function () { return VB.NetRec.line(); }) : '';
      var n = L.rooms.length;
      h = '<div class="ol-rooms ol-scroll" data-nav>';   // (el rótulo «Salas abiertas · n» va en la cabecera: headHTML)
      if (L.listErr) h += '<p class="ol-note bad">' + esc(L.listErr) + '</p>';
      if (!n && L.listAt) h += '<div class="ol-empty"><span class="ol-ghost" aria-hidden="true"><i>?</i><em>VS</em><i>?</i></span><span>Aún no hay salas. Crea una y avisa a alguien.</span></div>';
      var seen = L.seenAt || {}, now = {}, k = 0, tn = Date.now();
      L.rooms.forEach(function (r) {
        var t1 = now[r.id] = seen[r.id] || tn, isNew = tn - t1 < 1000;
        h += fxHTML(r, { isNew: isNew, delay: isNew ? k++ * 70 : 0, idx: L.rooms.indexOf(r) });
      });
      if (L.listAt) L.seenAt = now;
      if (rl) h += '<p class="ol-rec ol-recl">Tu récord online: <b>' + esc(rl) + '</b></p>';   // (al final de la cartelera: no quita sitio a las salas)
      h += '</div><div class="ol-bar ol-bar2 ol-dock" data-nav>' +
        (n ? '<button class="ol-act ol-ico sp-btn sp-ink sp-sq" data-shape="2" data-a="report" aria-label="Denunciar nombre">' + ic('rep') + '</button>' : '') +
        '<button class="ol-act sp-btn sp-alt" data-shape="1" data-a="code" aria-label="Entrar con código">' + ic('hash') + '<span class="sp-t">Código</span></button>' +
        '<button class="ol-act ol-new sp-btn sp-kit" data-shape="0" data-a="new"' + (L.busy ? ' disabled' : '') + '>' + ic('plus') + '<span class="sp-t">Crear sala</span></button></div>';
      if (L.edit === 'name' || L.edit === 'code') h += editHTML(myName());
    } else if (v === 'create') {
      var c = L.cfg, ms = maps(c.venue), cur = c.venue === 'beach' ? c.mapB : c.mapH;
      if (ms.indexOf(cur) < 0) { cur = ms[0]; if (c.venue === 'beach') c.mapB = cur; else c.mapH = cur; }
      var cb = c.venue === 'beach', ck = cb ? 'Playa' : 'Pabellón', vn = cur && VB.Venues && VB.Venues.name ? VB.Venues.name(cur) || cur : ck, fl = c.model === 'fluida' && c.fmt === '1v1';
      var pr = mkPrev(c, cur);
      // (orden, el mismo en el móvil y en PC: Formato, Escenario, Sede, Partido, Puntos, Igualado, Conexión)
      h = '<div class="ol-mk ' + (cb ? 'v-beach' : 'v-hall') + '">' +
        '<div class="mk-top"><i class="sp-chip">Tu sala</i><small>Así sale en la lista</small></div>' +
        '<div class="mk-prev" aria-hidden="true">' + fxHTML(pr, { prev: true, idx: 1 }) + '</div>' +
        '<div class="mk-sels ol-scroll" data-nav>' + mkRows(c, cb, ck, vn, fl) + '</div>' +
        '<p class="mk-tip">' + mkTip(c, fl) + '</p></div>' +
        '<div class="ol-bar ol-bar2 ol-dock mk-go" data-nav><button class="ol-act ol-new sp-patch" data-a="open"' + (L.busy ? ' disabled' : '') + '><span class="sp-l"><span class="sp-t">Abrir sala</span>' +
        '<small class="sp-s">' + esc(ck + (vn && vn !== ck ? ', ' + vn : '')) + '</small></span></button></div>';
    } else if (v === 'room' && L.mx) { h = mRoomHTML(true);   // (online de varios: las dos columnas de plazas)
    } else if (v === 'room' && L.room) {
      var r2 = L.room, host = L.role === 'host', me = myName(), riv = L.rival, st = '';
      if (L.started) st = 'Empieza el partido…';
      else if (L.status === 'wait') st = L.fail || 'Esperando rival. Tu sala sale en la lista de Online.';
      else if (L.status === 'connecting') st = 'Conectando con ' + riv + '…';
      else if (L.status === 'linked') st = 'Conectados. Empieza el partido…';
      var bad = !!L.fail && L.status === 'wait', left = host ? me : riv, right = host ? (riv || '') : me;
      var pl = function (nn, who, isRival, side) {
        if (!nn) return '<div class="ol-p mt-side ' + side + ' wait"><small>' + who + '</small><b><span class="ol-q">?</span><span class="ol-dots" role="img" aria-label="Esperando"><i></i><i></i><i></i></span></b></div>';
        return '<div class="ol-p mt-side ' + side + (isRival ? ' riv' : '') + '"><small>' + who + (isRival ? ' <span class="ar" aria-hidden="true">▼</span>' : '') + '</small><b>' + esc(nn) + '</b></div>';
      };
      var b2 = r2.venue === 'beach', vn2 = venueName(r2), k2 = b2 ? 'Playa' : 'Pabellón';
      h = '<div class="ol-match sp-panel ol-scroll ' + (b2 ? 'v-beach' : 'v-hall') + (riv ? ' has-riv' : '') + '">' +
        '<div class="mt-top" data-nav><span class="sp-crest" aria-hidden="true">' + VEN_IC[b2 ? 'beach' : 'hall'] + '</span><span class="mt-ven"><b data-ph-ell>' + k2 + (vn2 && vn2 !== k2 ? ', ' + esc(vn2) : '') + '</b>' +
        (host ? '' : '<small class="mt-who">Sala de ' + esc(r2.name) + '</small>') + '</span>' +
        '<button class="ol-code sp-chip" type="button" data-a="copy" aria-label="' + esc('Código ' + r2.code.split('').join(' ') + '. Copiar') + '">' + esc(r2.code) + IC.copy + '</button></div>' +
        '<div class="ol-vs">' + pl(left, host ? 'Tú' : 'Rival', !host, 'mt-a') + '<span class="ol-mid">VS</span>' + pl(right, host ? 'Rival' : 'Tú', host && !!riv, 'mt-b') + '</div>' +
        '<div class="fx-chips mt-chips">' + chipsHTML(r2) + '</div>' +
        (L.started ? '' : '<div class="ol-rules"><i>' + IC.nopause + 'Sin pausa</i><i>' + IC.clock + '10 s entre sets</i><i>' + IC.flag + 'Abandonar = derrota</i></div>') + '</div>' +
        // (móvil: el estado va fuera del desplazamiento, justo encima de la barra, siempre a la vista y opaco)
        '<p class="ol-st ol-st-pin' + (bad ? ' bad' : '') + '" role="status">' + esc(st) + '</p>' +
        '<div class="ol-bar ol-bar2 ol-dock" data-nav><button class="ol-act ol-out sp-btn sp-danger sp-dock-l" data-shape="1" data-a="leave">' + ic('out') + '<span class="sp-t">Salir de la sala</span></button>' +
        (riv && rivalUid() ? '<button class="ol-act ol-ico sp-btn sp-ink sp-sq" data-shape="2" data-a="report" aria-label="' + esc('Denunciar nombre de ' + riv) + '">' + ic('rep') + '</button>' : '') +
        (host ? '<button class="ol-act ol-new sp-btn sp-kit" data-shape="0" data-a="share">' + ic('share') + '<span class="sp-t">Compartir</span></button>' : '') + '</div>';
    }
    return h;
  }
  function viewHTML() {
    var v = L.view, h = '';
    if (v === 'noacc') {
      h = '<div class="ol-card sp-panel"><h3>Necesitas una cuenta para jugar online</h3><p>Entra con tu cuenta (o créala, es gratis) y vuelve aquí. Tu rival solo verá tu nombre.</p></div>' +
        '<div class="ol-ctas" data-nav>' + row('acc', 'Ir a Cuenta', 'Entrar o crear una cuenta', '', { color: 'sp-kit', shape: 0 }) + '</div>';
    } else if (v === 'off') {
      h = '<div class="ol-card sp-panel"><h3>El online aún no está activado en el servidor</h3><p>Todavía no se puede jugar online. Vuelve a probar dentro de un rato.</p>' +
        (pvv() ? '<span class="ol-retry" role="status">Lo intentamos otra vez en 30 s</span>' : '') + '</div>' +   // (ronda final: en vertical, como en horizontal)
        '<div class="ol-ctas" data-nav>' + row('retry', 'Volver a probar', '', '', { color: 'sp-gold', shape: 1 }) + '</div>';
    } else if (v === 'nortc') {
      h = '<div class="ol-card sp-panel"><h3>Este navegador no puede jugar online</h3><p>Prueba con una versión reciente de Chrome, Edge, Firefox o Safari (en el iPhone, sin el modo Aislamiento).</p></div>' +
        (pvv() ? '<div class="ol-ctas" data-nav>' + row('copylink', 'Copiar enlace', 'Para abrirlo en otro navegador', '', { color: 'sp-gold', shape: 1 }) + row('goback', 'Volver', '', '', { color: 'sp-ink', shape: 2 }) + '</div>' : '');
    } else if (v === 'help') {
      h = helpHTML() + '<div class="ol-bar ol-bar2 hp-go" data-nav><button class="ol-act ol-new sp-btn sp-gold sp-wide" data-shape="2" data-a="helpOk"><span class="sp-t">Entendido</span></button></div>';
    } else if (v === 'list') {
      // (rediseño 1.5.x, petición de Ferran: que las salas no parezcan botones del menú) Arriba, una BARRA de acciones compacta
      // (un solo alto en ↑↓; ←→ recorre la barra). Debajo, la CARTELERA: una franja por sala como un rótulo de TV.
      var nm = myName(), bk = L.barKey || 'new';
      if (bk === 'new' && L.busy) bk = 'code';   // («Crear sala» desactivado: la parada de la barra pasa a «Código», para no quedarse sin ninguna)
      // (SPLAT) cada acción, una mancha de su color: Crear sala (equipación), Código (contraste), tu nombre (tinta), actualizar y ayuda (cuadradas)
      var act = function (a, inner, cls, aria, dis, n) {
        return '<button class="ol-act sp-btn' + (cls ? ' ' + cls : '') + '" data-a="' + a + '" data-shape="' + n + '"' + (a === bk ? '' : ' data-skip') + (dis ? ' disabled' : '') +
          (aria ? ' aria-label="' + esc(aria) + '"' : '') + '>' + inner + '</button>';
      };
      // (con el teclado en pantalla abierto la barra se esconde: el teclado ocupa su sitio y el de la cartelera; B cancela)
      h = note() + '<div class="ol-bar" data-nav' + (L.osk ? ' hidden' : '') + '>' +
        act('new', ic('plus') + '<span class="sp-t">Crear sala</span>', 'ol-new sp-kit', '', L.busy, 0) +
        act('code', ic('hash') + '<span class="sp-t">Código</span>', 'sp-alt', 'Entrar con código', false, 1) +
        act('name', ic('pen') + '<span class="sp-t ol-me">' + esc(nm) + '</span>', 'ol-nm sp-ink sp-wide', 'Tu nombre: ' + nm + '. Cambiar', false, 2) +
        act('refresh', ic('ref'), 'ol-ico sp-ink sp-sq' + (L.loading ? ' spin' : ''), 'Actualizar', false, 0) +
        act('help', '<span class="ol-q">?</span>', 'ol-ico sp-gold sp-sq', 'Cómo funciona', false, 1) +
        (L.rooms.length ? act('report', ic('rep'), 'ol-ico sp-ink sp-sq', 'Denunciar nombre', false, 2) : '') + '</div>';
      if (L.edit === 'name' || L.edit === 'code') h += editHTML(nm);
      if (L.osk) return h;   // (teclado en pantalla abierto: ocupa el sitio de la cartelera, sobre todo en un teléfono apaisado)
      // (fase 3: tu récord online, aparte del de Partido rápido; abandonar cuenta como derrota)
      var rl = VB.NetRec ? safe(function () { return VB.NetRec.line(); }) : '';
      var n = L.rooms.length, cnt = L.loading && !L.listAt ? 'Buscando…' : L.listAt ? (n === 1 ? '1 sala' : n + ' salas') : '';
      h += '<div class="ol-board"><h3 class="ol-bh"><span class="ol-live" aria-hidden="true"></span>Salas abiertas<span class="ol-n">' + cnt + '</span>' +
        (rl ? '<span class="ol-rec">Tu récord <b>' + esc(rl) + '</b></span>' : '') + '</h3>';
      if (L.listErr) h += '<p class="ol-note bad">' + esc(L.listErr) + '</p>';
      h += '<div class="ol-rooms ol-scroll" data-nav>';
      if (!n) h += L.listAt ? '<div class="ol-empty"><span class="ol-ghost" aria-hidden="true"><i>?</i><em>VS</em><i>?</i></span><span>Aún no hay salas. Crea una y avisa a alguien.</span></div>' : '';
      // (animación de entrada: una sala es «nueva» durante 1 s desde que se ve por primera vez; así un repintado en ese segundo no la corta)
      var seen = L.seenAt || {}, now = {}, k = 0, tn = Date.now();
      L.rooms.forEach(function (r) {
        var t1 = now[r.id] = seen[r.id] || tn, isNew = tn - t1 < 1000;
        h += fxHTML(r, { isNew: isNew, delay: isNew ? k++ * 70 : 0, idx: L.rooms.indexOf(r) });
      });
      if (L.listAt) L.seenAt = now;
      h += '</div></div>';
    } else if (v === 'create') {
      var c = L.cfg, ms = maps(c.venue), cur = c.venue === 'beach' ? c.mapB : c.mapH;
      if (ms.indexOf(cur) < 0) { cur = ms[0]; if (c.venue === 'beach') c.mapB = cur; else c.mapH = cur; }
      var cb = c.venue === 'beach', ck = cb ? 'Playa' : 'Pabellón', vn = cur && VB.Venues && VB.Venues.name ? VB.Venues.name(cur) || cur : ck;
      // (fase 6) El mismo lenguaje que la cartelera: UN rótulo con la franja de la sede (arena / madera), la vista previa de tu sala tal
      // y como saldrá en la lista (TÚ VS ?, con sus chips) y debajo los selectores compactos (↑↓ elige, ←→ cambia). Sin tarjetas sueltas.
      var fl = c.model === 'fluida' && c.fmt === '1v1';
      var pr = mkPrev(c, cur);
      // (SPLAT) arriba, «Tu sala» y la vista previa tal y como saldrá en la lista (el brochazo de la cartelera); debajo, los selectores de
      // Partido rápido (pegatinas de tinta, se desplazan por dentro) y «Abrir sala» en parche cosido, siempre a la vista.
      h = note() + '<div class="ol-mk ' + (cb ? 'v-beach' : 'v-hall') + '">' +
        '<div class="mk-top"><i class="sp-chip">Tu sala</i><small>Así sale en la lista</small></div>' +
        '<div class="mk-prev" aria-hidden="true">' + fxHTML(pr, { prev: true, idx: 1 }) + '</div>' +
        '<div class="mk-sels ol-scroll" data-nav>' + mkRows(c, cb, ck, vn, fl) + '</div>' +
        '<p class="mk-tip">' + mkTip(c, fl) + '</p></div>' +
        '<div class="ol-bar ol-bar2 mk-go" data-nav><button class="ol-act ol-new sp-patch" data-a="open"' + (L.busy ? ' disabled' : '') + '><span class="sp-l"><span class="sp-t">Abrir sala</span>' +
        '<small class="sp-s">' + esc(ck + (vn && vn !== ck ? ', ' + vn : '')) + '</small></span></button></div>';
    } else if (v === 'room' && L.mx) { h = note() + mRoomHTML(false);   // (online de varios)
    } else if (v === 'room' && L.room) {
      var r2 = L.room, host = L.role === 'host', me = myName(), riv = L.rival;
      var st = '', bad = false;
      if (L.started) st = 'Empieza el partido…';
      else if (L.status === 'wait') st = L.fail || 'Esperando rival. Tu sala sale en la lista de Online.';
      else if (L.status === 'connecting') st = 'Conectando con ' + riv + '…';
      else if (L.status === 'linked') st = 'Conectados. Empieza el partido…';
      bad = !!L.fail && L.status === 'wait';
      // (rediseño 1.5.x) El mismo rótulo que la cartelera, en grande: sede a la izquierda, tú VS rival, y el hueco «?» hasta que llega.
      var left = host ? me : riv, right = host ? (riv || '') : me;
      var pl = function (n, who, isRival, side) {
        if (!n) return '<div class="ol-p mt-side ' + side + ' wait"><small>' + who + '</small><b><span class="ol-q">?</span><span class="ol-dots" role="img" aria-label="Esperando"><i></i><i></i><i></i></span></b></div>';
        return '<div class="ol-p mt-side ' + side + (isRival ? ' riv' : '') + '"><small>' + who + (isRival ? ' <span class="ar" aria-hidden="true">▼</span>' : '') + '</small><b>' + esc(n) + '</b></div>';
      };
      var b2 = r2.venue === 'beach', vn2 = venueName(r2), k2 = b2 ? 'Playa' : 'Pabellón';
      h = '<div class="ol-match sp-panel ' + (b2 ? 'v-beach' : 'v-hall') + (riv ? ' has-riv' : '') + '">' +
        '<div class="mt-top"><span class="sp-crest" aria-hidden="true">' + VEN_IC[b2 ? 'beach' : 'hall'] + '</span><span class="mt-ven"><b>' + k2 + '</b>' + (vn2 && vn2 !== k2 ? '<small>' + esc(vn2) + '</small>' : '') + '</span>' +
        '<span class="mt-who">' + (host ? 'Tu sala' : 'Sala de ' + esc(r2.name)) + '</span>' +
        '<span class="ol-code sp-chip" aria-label="Código ' + esc(r2.code.split('').join(' ')) + '">' + esc(r2.code) + '</span></div>' +
        '<div class="ol-vs">' + pl(left, host ? 'Tú' : 'Rival', !host, 'mt-a') + '<span class="ol-mid">VS</span>' + pl(right, host ? 'Rival' : 'Tú', host && !!riv, 'mt-b') + '</div>' +
        '<div class="fx-chips mt-chips">' + chipsHTML(r2) + '</div>' +
        '<p class="ol-st' + (bad ? ' bad' : '') + '" role="status">' + esc(st) + '</p>' +
        (L.started ? '' : '<p class="ol-tip">Llevas a tu n.º 1 y la IA a tu pareja. No hay pausa durante el juego: entre sets, 10 s de descanso. Abandonar cuenta como derrota.</p>') + '</div>' +
        '<div class="ol-bar ol-bar2" data-nav>' + (host ? '<button class="ol-act sp-btn sp-teal" data-shape="0" data-a="copy">' + ic('copy') + '<span class="sp-t">Copiar código</span></button>' : '') +
        '<button class="ol-act ol-out sp-btn sp-danger" data-shape="1" data-a="leave">' + ic('out') + '<span class="sp-t">Salir de la sala</span></button>' +
        (riv && rivalUid() ? '<button class="ol-act sp-btn sp-ink" data-shape="2" data-a="report">' + ic('rep') + '<span class="sp-t">Denunciar nombre</span></button>' : '') + '</div>';
    }
    return h;
  }
  var lastH = '';
  function render(force) {
    if (!L.host || !L.on) return;
    var body = L.host.querySelector('.ol-body'); if (!body) return;
    var PH = ph(), TO = PH || pvv(), hr = L.host.querySelector('.ol-hr'), h = PH ? viewPH() : viewHTML(), hh = PH ? headHTML() : '', all = h + '\u0002' + hh;
    // (móvil: el aviso, una vez, al carril de arriba; la misma frase no se repite hasta que se borra)
    if (TO && L.msg && L.msg !== L.toasted && VB.Splat && VB.Splat.toast) { try { L.toastApi = VB.Splat.toast(esc(L.msg), { key: 'ol', ms: 6500, cls: L.msgBad ? 'ol-tbad' : '' }); } catch (e) { } }
    if (!L.msg && L.toastApi) { L.toastApi.close(); L.toastApi = null; }   // (aviso resuelto o vista nueva: fuera)
    L.toasted = L.msg;
    if (!force && all === lastH) return;
    var a = document.activeElement, inH = a && (body.contains(a) || (hr && hr.contains(a))), key = inH ? keyOf(a) : null, kf = a && a.classList && a.classList.contains('kf');
    lastH = all; body.innerHTML = h; body.setAttribute('data-v', L.view);
    if (hr && hr.innerHTML !== hh) hr.innerHTML = hh;
    if (VB.Splat && VB.Splat.decorate) { try { VB.Splat.decorate(body); if (hr) VB.Splat.decorate(hr); } catch (e) { } }   // (SPLAT: manchas, brochazos y parche)
    if (TO && VB.Splat && VB.Splat.more) { var sc = body.querySelectorAll('.ol-scroll'); for (var i = 0; i < sc.length; i++) { try { VB.Splat.more(sc[i]); } catch (e) { } } }
    var inp = body.querySelector('#olIn');
    if (inp) { bindInput(inp); setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { } }, 20); return; }
    if (key) { var b = findKey(L.host, key) || first(); if (b) { try { b.focus({ preventScroll: !kf }); } catch (e) { } if (kf) b.classList.add('kf'); } }
  }
  function keyOf(b) { if (b.getAttribute('data-a') === 'osk') return 'oskp|' + b.getAttribute('data-r') + '|' + b.getAttribute('data-i'); return b.getAttribute('data-a') ? b.getAttribute('data-a') + '|' + (b.getAttribute('data-id') || '') : b.getAttribute('data-ol') ? 'ol|' + b.getAttribute('data-ol') : null; }
  function findKey(body, k) {
    var p = k.split('|'), sel = p[0] === 'oskp' ? '.osk-k[data-r="' + p[1] + '"][data-i="' + p[2] + '"]' : p[0] === 'ol' ? '[data-ol="' + p[1] + '"]' : '[data-a="' + p[0] + '"]' + (p[1] ? '[data-id="' + p[1] + '"]' : '');
    var b = body.querySelector(sel); return b && !b.disabled ? b : null;
  }
  function first() { var b = L.host && L.host.querySelector('.ol-body button:not([disabled])'); return b || null; }
  function bindInput(inp) {
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab') return;   // (navegación del menú)
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
      else if (e.key === 'Escape') { e.preventDefault(); var k = L.edit; L.edit = ''; L.osk = null; render(true); focusA(k); }
    });
  }
  function commitEdit() {
    var inp = L.host && L.host.querySelector('#olIn'), v = inp ? inp.value : L.osk ? L.osk.v : '', k = L.edit;
    L.osk = null;
    if (k === 'name') {
      var n = NR().cleanName(v), F = VB.NameFilter;
      // vacío = volver al nombre anónimo («Jugador NNNN»)
      if (!String(v || '').trim()) { ls(NICK, null); L.msg = ''; L.edit = ''; render(true); focusA('name'); return; }
      if (!n) { L.msg = 'El nombre tiene que tener entre 2 y 16 caracteres (y no puede ser un correo).'; L.msgBad = true; L.edit = ''; render(true); focusA('name'); return; }
      if (F && F.bad(n)) { L.msg = F.MSG; L.msgBad = true; L.edit = ''; render(true); focusA('name'); return; }
      ls(NICK, n); if (F && F.NICKV) ls(F.NICKV, '1');   // escrito tras 1.22.0: elegido de verdad, el paso de migrateNick ya no lo toca
      L.msg = ''; L.edit = ''; render(true); focusA('name');
    } else if (k === 'code') { L.edit = ''; render(true); joinCode(v); }
  }
  function focusSel(sel, kf) {
    setTimeout(function () {
      var b = L.host && L.host.querySelector(sel); if (!b) return;
      try { b.focus(); } catch (e) { }
      if (kf) { var pv = document.querySelectorAll('.kf'); for (var j = 0; j < pv.length; j++) pv[j].classList.remove('kf'); b.classList.add('kf'); }
    }, 30);
  }
  function focusA(a) { setTimeout(function () { var b = L.host && L.host.querySelector('[data-a="' + a + '"]'); if (b) { try { b.focus(); } catch (e) { } } }, 30); }

  function step(k, d) {
    var c = L.cfg; if (!c) return;
    if (k === 'fmt') { var FM = ['1v1', '2v2', '6v6'], fi = FM.indexOf(c.fmt); c.fmt = FM[((fi < 0 ? 0 : fi) + (d > 0 ? 1 : -1) + 3) % 3]; cfgFix(c); }
    else if ((k === 'venue' && c.fmt === '6v6') || (k === 'net' && c.fmt !== '1v1')) return;   // (filas fijas por el formato)
    else if (k === 'venue') c.venue = c.venue === 'beach' ? 'hall' : 'beach';
    else if (k === 'map') { var ms = maps(c.venue), cur = c.venue === 'beach' ? c.mapB : c.mapH, i = ms.indexOf(cur); i = (i + (d > 0 ? 1 : -1) + ms.length) % ms.length; if (c.venue === 'beach') c.mapB = ms[i]; else c.mapH = ms[i]; }
    else if (k === 'bo') c.bo = c.bo === 3 ? 1 : 3;
    else if (k === 'pts') { var PV = [11, 15, 21, 25], pi = PV.indexOf(c.pts); c.pts = PV[((pi < 0 ? 2 : pi) + (d > 0 ? 1 : -1) + PV.length) % PV.length]; }
    else if (k === 'even') c.even = !c.even;
    else if (k === 'net') c.model = c.model === 'fluida' ? 'precisa' : 'fluida';
    L.lastSel = k;   // (móvil: la fila tocada la última enseña su explicación)
    sound('optChange'); render();
  }
  function onClick(ev) {
    var t = ev.target, b = t && t.closest ? t.closest('button') : null;
    if (!b || !L.host.contains(b) || b.disabled) return;
    if (b.classList.contains('mp-back')) return;   // (ui.js)
    var olk = b.getAttribute('data-ol');
    if (olk) { var ar = t.closest('.arr'); step(olk, ar ? +ar.getAttribute('data-d') : 1); return; }
    var a = b.getAttribute('data-a'); if (!a) return;
    sound('click');
    if (a === 'acc') { if (VB.Account && VB.Account.open) VB.Account.open(); }
    else if (a === 'retry') { if (noRtc()) { setView('nortc'); return; } setView('list'); refreshList(true); }
    else if (a === 'help') { L.msg = ''; L.hpPage = 0; setView('help'); setTimeout(function () { var f = first(); if (f) f.focus(); }, 30); }
    else if (a === 'helpNext' || a === 'helpPrev') { L.hpPage = Math.max(0, Math.min(hpPages() - 1, (L.hpPage | 0) + (a === 'helpNext' ? 1 : -1))); render(true); focusA(L.hpPage >= hpPages() - 1 ? 'helpOk' : L.hpPage ? a : 'helpNext'); }
    else if (a === 'editX') { var ek = L.edit; L.edit = ''; L.osk = null; render(true); focusA(ek); }
    else if (a === 'share') shareRoom();
    else if (a === 'helpOk') { ls(HELPK, '1'); setView('list'); refreshList(false); focusA(L.helpFrom || 'help'); L.helpFrom = ''; }
    else if (a === 'new') { L.cfg = cfgFix(prefs()); L.msg = ''; L.lastSel = ''; setView('create'); setTimeout(function () { var f = first(); if (f) f.focus(); }, 30); }
    else if (a === 'open') createRoom();
    else if (a === 'name' || a === 'code') {
      L.edit = a; L.msg = '';
      // (con mando: teclado en pantalla, con el foco en la primera letra)
      if (padNow()) { var v0 = a === 'name' ? typedName() : ''; L.osk = { v: v0, col: 0, up: !v0, auto: !v0 }; render(true); focusSel('.osk-k[data-r="1"][data-i="0"]', true); }
      else { L.osk = null; render(true); }
    }
    else if (a === 'osk') oskKey(b.getAttribute('data-id'));
    else if (a === 'nameOk' || a === 'codeOk') commitEdit();
    else if (a === 'join') joinRoom(b.getAttribute('data-id'));
    else if (a === 'refresh') refreshList(true);
    else if (a === 'leave') { leaveRoom(); L.msg = ''; setView('list'); refreshList(true); focusA('new'); }
    else if (a === 'copy') copyCode();
    else if (a === 'report') { var rc = L.mx && L.mx.room ? L.mx.room.code : L.room ? L.room.code : ''; reportOpen(L.view === 'list' ? listPeople() : others(), rc); }
    // online de varios (sala de espera con plazas)
    else if (a === 'chair') mChair(+b.getAttribute('data-id'));
    else if (a === 'ready') mReady();
    else if (a === 'start') mStart();
    else if (a === 'swap') mSwap();
    else if (a === 'kick') mKick();
    else if (a === 'unpick') { L.pick = ''; render(); focusA('leave'); }
    else if (a === 'pick') mPick(b.getAttribute('data-id'));
    else if (a === 'copylink') copyLink();
    else if (a === 'goback') { var gb = document.getElementById('btnOnlineBack'); if (gb) gb.click(); }   // (vertical, «Este navegador no puede»: Volver abajo)
  }
  /** Móvil, sin WebRTC: copia la dirección del juego para abrirla en otro navegador. */
  function copyLink() {
    var url = shareSite(), done = function () { if (VB.Splat && VB.Splat.toast) VB.Splat.toast('Enlace copiado: ábrelo en Chrome o Safari', { key: 'olc' }); };
    try { navigator.clipboard.writeText(url).then(done, done); } catch (e) { done(); }
  }
  function copyCode() {
    var c = L.room && L.room.code; if (!c) return;
    var done = function () {
      L.fail = '';
      if ((ph() || pvv()) && VB.Splat && VB.Splat.toast) { VB.Splat.toast('Código copiado: <b>' + esc(c) + '</b>', { key: 'olc' }); return; }   // (móvil: aviso de arriba)
      var s = L.host.querySelector('.ol-st'); if (s) s.textContent = 'Código copiado: ' + c;
    };
    try { navigator.clipboard.writeText(c).then(done, done); } catch (e) { done(); }
  }
  /** Dirección que se comparte: la casa nueva (https://takethecourt.com/) desde ella y desde la antigua (purupurpito.github.io, que
   *  durante el traspaso redirige con el puente); en local o en pruebas, la página actual. */
  function shareSite() {
    var h = location.hostname;
    if (location.protocol === 'https:' && (h === 'takethecourt.com' || h === 'www.takethecourt.com' || h === 'purupurpito.github.io')) return 'https://takethecourt.com/';
    return location.origin + location.pathname;
  }
  /** Móvil: «Compartir» de la sala de espera (la hoja de compartir del sistema con el enlace ?sala=CÓDIGO; sin ella, se copia el enlace). */
  function shareRoom() {
    var c = L.room && L.room.code; if (!c) return;
    var url = shareSite() + '?sala=' + c, txt = 'Juega conmigo a Take the Court: sala ' + c;
    var copied = function () { if (VB.Splat && VB.Splat.toast) VB.Splat.toast('Enlace copiado. Código <b>' + esc(c) + '</b>', { key: 'olc' }); };
    var copy = function () { try { navigator.clipboard.writeText(txt + ' ' + url).then(copied, copied); } catch (e) { copied(); } };
    if (navigator.share) { try { navigator.share({ title: 'Take the Court', text: txt, url: url }).catch(function (e) { if (!e || e.name !== 'AbortError') copy(); }); return; } catch (e) { } }
    copy();
  }

  /* =====================================================================================================================
   * ONLINE DE VARIOS (sprint online-multi, paquete P6; notes/online-multi-brief.md §4-5, notes/online-multi-requests.md)
   * Salas de 2 contra 2 (hasta 4 personas) y 6 contra 6 (hasta 12, siempre en Pabellón), y la Carrera cooperativa
   * (VB.NetLobby.coop, para P7). Cada persona lleva UN jugador; la IA, los sitios libres. Sala = esquema v3 de js/netroom.js.
   *  - Estrella: el anfitrión abre un enlace WebRTC con CADA invitado, en paralelo (una oferta por invitado en cuanto se sienta en
   *    la sala; sig/o_<uid> y sig/a_<uid>). E.links = {uid: Link} (L.mx.links en el lobby). Los invitados no se conectan entre sí.
   *  - En cuanto el enlace abre, todo va por el canal 'ctl' (JSON) y ese invitado deja de leer Firestore: saludo ('lb-hi': nombre,
   *    atributos, look, conexión, puesto preferido), la sala ('lb': ro = {v, ko, m: [{u, n, c, r, p, h, ok}]} = uid, nombre, sitio
   *    (-1 = de pie), listo, ping (ms, lo mide el anfitrión), anfitrión, conectado; ko = camisetas de los dos equipos), sentarse
   *    ('lb-sit'), listo ('lb-rdy'), latido ('lb-ping' / 'lb-pong' cada KEEP_MS: el ping y la caída sin aviso, DEAD_MS), sacar
   *    ('lb-out'), salir ('lb-bye') y empezar ('lb-go'). Lo grande va troceado en piezas de CHUNK caracteres ('lbk', ≤ 12 KB en
   *    UTF-8: SCTP lleva mal los mensajes de más de 16 KB en algunos navegadores). Todos empiezan por {"k":"lb…" (o "cx" en la coop).
   *  - Sitio c = equipo · porLado + índice en el equipo (2v2: 0-1; 6v6: 0-5 = S, OH1, MB1, OPP, OH2, MB2, el orden de la sim). En la
   *    coop todos los sitios son del equipo 0.
   *  - Arranque: «Empezar» (anfitrión; cuando todos los que están dentro están sentados y listos) manda a cada invitado sentado
   *    {k:'lb-go', us (uid de cada plaza), humans [{team, idx, name}], looks, seed, opts, model, fmt}. La plaza 0 es la del anfitrión
   *    y las demás van por sitio. Un invitado que no llegó a conectar se suelta (su sitio lo lleva la IA; la sala no se rehace).
   *    Luego ctx.actions.startOnline (main.js; notes/online-multi-requests.md P4 → P6) con humans, seat, links (anfitrión: los de
   *    los invitados en el orden de sus plazas, links[k] = plaza k + 1; invitado: [el del anfitrión]), opts (anfitrión; el invitado
   *    null, como en el 1 contra 1: llegan en el saludo de la sesión), model y format.
   *  - En pleno partido, si un enlace cae, se renegocia esa pareja sobre la misma sala (gen + 1), como en el 1 contra 1.
   * ===================================================================================================================== */
  var FMT_TXT = { '1v1': '1 contra 1', '2v2': '2 contra 2', '6v6': '6 contra 6' };
  var ROLE6_TXT = ['Colocador', 'Receptor 1', 'Central 1', 'Opuesto', 'Receptor 2', 'Central 2'], ROLE6_K = ['S', 'OH', 'MB', 'OPP', 'OH', 'MB'];
  var KEEP_MS = 1000, DEAD_MS = 9000, PUMP_MS = 40, CHUNK = 4000, RO_PING_MS = 2000, BAN_MS = 15000;
  // (salir de la app antes de empezar, p. ej. a WhatsApp a pegar el código: el móvil congela los temporizadores. Quien se va avisa
  //  ('lb-away') y los demás le esperan AWAY_MS en vez de DEAD_MS; la propia página no cuenta silencios mientras está oculta.
  //  Las caídas de verdad las da el estado 'closed' del enlace. LEFT_BAN_MS: veto corto tras salir, más que un sondeo de ida y vuelta)
  var AWAY_MS = 60000, LEFT_BAN_MS = 4000;
  // (coop emparejada entre partidos: un enlace caído se renegocia; si en COOP_DOWN_MS no vuelve, se acaba la coop, como los 60 s del partido)
  var COOP_DOWN_MS = 60000;
  // Lecturas de Firestore (L3, 22-nov-2026; cuentas por sala en tools/roomtest.js «ciclo de vida»):
  //  - PLAY_BEAT_MS: con el partido empezado o la coop emparejada nadie más entra; el latido solo evita que la sala caduque (5 min) para
  //    poder renegociar un enlace. Uno por minuto basta (aunque el móvil frene los temporizadores a 1 por minuto: 2 min < 5 min).
  //  - HID_POLL_MS: el anfitrión con la pestaña oculta (p. ej. pasando el código por WhatsApp) mira su sala cada 6 s en vez de cada 2 s;
  //    al volver, una lectura y un latido en el acto (mxVis).
  //  - MX_STALE_MS / MX_OFFER_MAX: el invitado que espera la oferta da al anfitrión por ido si su latido tiene más de 65 s (antes 30 s:
  //    un anfitrión con la pestaña oculta y aún sin enlaces puede quedar a 1 temporizador por minuto en Chrome) y como mucho 95 s.
  var PLAY_BEAT_MS = 60000, HID_POLL_MS = 6000, MX_STALE_MS = 65000, MX_OFFER_MAX = 95000;
  IC.swap = svg('M4 8.5h14.5l-3.5-3.5M20 15.5H5.5L9 19');
  function noop() { }
  function fmtOf(r) { return !r || !r.multi ? '1v1' : r.fmt === '6v6' ? '6v6' : '2v2'; }
  function perSide(r) { return r && r.fmt === '6v6' ? 6 : 2; }
  function nChairs(r) { return r && r.mode === 'coop' ? perSide(r) : 2 * perSide(r); }
  function chairOf(r, c) { var ps = perSide(r); return { t: (c / ps) | 0, i: c % ps }; }
  function dorsal(r, c) { var q = chairOf(r, c); return perSide(r) === 6 ? q.t * 6 + q.i + 1 : [[1, 2], [3, 9]][q.t][q.i]; }
  function chairRole(r, c) { var q = chairOf(r, c); return perSide(r) === 6 ? ROLE6_TXT[q.i] : 'Jugador ' + (q.i + 1); }
  /** Puesto preferido en el 6 contra 6 (el de Partido rápido, ui.js: localStorage 'make-the-cut.role6'). */
  function role6Pref() { var v = ls('make-the-cut.role6'); return ROLE6_K.indexOf(v) >= 0 ? v : ''; }
  function iceOpt() { return Q.netice === 'none' && LOCAL ? [] : undefined; }
  /** Look de una plaza del online de varios: cada humano lleva UN jugador, así que basta su n.º 1 (menos bytes en 'lb-go'). */
  function trimLook(lk) { lk = saneLook(lk); return lk ? { fits: [lk.fits[0] || lk.fits[1] || null, null], kit: lk.kit } : null; }
  function cfgFix(c) { if (c.fmt === '6v6') c.venue = 'hall'; return c; }
  /** «Crear sala»: la sala de muestra (así sale en la lista). */
  function mkPrev(c, cur) {
    var cb = c.venue === 'beach', m = c.fmt === '2v2' || c.fmt === '6v6';
    var pr = { name: myName(), venue: c.venue, map: cur, bo: c.bo, pts: cb ? 21 : c.pts, even: c.even, net: c.model === 'fluida' && !m ? 'fluida' : undefined };
    if (m) { pr.multi = true; pr.mode = 'vs'; pr.fmt = c.fmt; pr.cap = c.fmt === '6v6' ? 12 : 4; pr.nseat = 0; pr.free = pr.cap - 1; pr.state = 'open'; }
    return pr;
  }
  /** Filas de «Crear sala» (mismo orden en el móvil y en PC). 6v6: Escenario fijo en Pabellón; Conexión: 1v1 a elegir, 2v2 Precisa,
   *  6v6 la del anfitrión (model 'host'). */
  function mkRows(c, cb, ck, vn, fl) {
    var six = c.fmt === '6v6', m = c.fmt === '2v2' || six;
    var netV = !m ? (fl ? 'Fluida (v2)' : 'Precisa (v1)') : six ? 'Anfitrión' : 'Precisa (v1)';
    var netH = !m ? (fl ? 'Tu lado, sin retraso' : 'Los dos veis lo mismo') : six ? 'La partida va por quien crea la sala' : 'En 2 contra 2, siempre Precisa';
    return selRow('fmt', 'Formato', FMT_TXT[c.fmt] || FMT_TXT['1v1'], !m ? 'Tú y tu rival, cada uno con un compañero IA' : six ? 'Hasta 12 personas; la IA, el resto' : 'Hasta 4 personas; la IA, el resto', 1, false, six) +
      selRow('venue', 'Escenario', ck, six ? 'El 6 contra 6 es en pista' : cb ? 'En la arena' : 'En pista cubierta', 0, six) +
      selRow('map', 'Sede', vn, 'Donde se juega', 2) +
      selRow('bo', 'Partido', c.bo === 3 ? 'Mejor de 3' : '1 set', c.bo === 3 ? (cb ? 'Sets a 21; el tercero, a 15' : 'Gana quien gane 2 sets') : 'Un solo set', 1) +
      (cb ? '' : selRow('pts', 'Puntos', String(c.pts), 'Puntos por set', 3)) +
      selRow('even', 'Igualado', c.even ? 'Sí' : 'No', c.even ? 'Nadie lleva atributos ni insignias' : 'Cada persona, con los de su jugador', 0) +
      selRow('net', 'Conexión', netV, netH, 2, m);
  }
  function mkTip(c, fl) {
    // (lane A: la partida del 6 contra 6 va por el aparato de quien crea la sala, que sube ~130 KB/s con 11 invitados: un consejo, una línea)
    if (c.fmt === '6v6') return 'Mejor desde un ordenador o con wifi.';
    if (c.fmt === '2v2') return 'Cada persona lleva un jugador y la IA, los sitios libres. Tú repartes los sitios en la sala de espera.';
    return fl ? 'Tu equipo responde al instante y el rival se ve una pizca en diferido. Sin repeticiones en esta versión.'
      : c.even ? 'Igualado: nadie lleva atributos ni insignias.' : 'Cada persona juega con los atributos de su jugador.';
  }

  /* ---- motor de la sala (anfitrión o invitado; lo usan el lobby y la Carrera cooperativa) ---- */
  /** o = {role, room, coop, mock, name, look, onChange(E), onNote(texto, malo, E), onEnd(why, E), onGo(msg, E)} */
  function Mx(o) {
    return { o: o, role: o.role, room: o.room, coop: !!o.coop, mock: !!o.mock, myU: o.mock ? 'mockMe' : api().uid() || '', peers: {}, links: {}, ro: { v: 0, m: [], ko: null },
      hi: {}, tm: {}, started: false, attached: false, closed: false, gen: 0, buf: {}, hostLink: null, heard: {}, lastPing: 0, roAt: 0, roDirty: false, ban: {}, cnt: 0, away: {},
      status: o.role === 'host' ? 'wait' : 'connecting', gotOffer: false, nm: ownName(o.name), lk: o.look ? saneLook(o.look) : null };
  }
  function mxEvery(E, k, ms, f) { clearInterval(E.tm[k]); E.tm[k] = setInterval(f, ms); }
  function mxAfter(E, k, ms, f) { clearTimeout(E.tm[k]); E.tm[k] = setTimeout(f, ms); }
  function mxStop(E, k) { clearInterval(E.tm[k]); clearTimeout(E.tm[k]); delete E.tm[k]; }
  function mxStopAll(E, keep) { Object.keys(E.tm).forEach(function (k) { if (!keep || keep.indexOf(k) < 0) mxStop(E, k); }); }
  function mxMem(E, u) { for (var i = 0; i < E.ro.m.length; i++) if (E.ro.m[i].u === u) return E.ro.m[i]; return null; }
  function mxAt(E, c) { for (var i = 0; i < E.ro.m.length; i++) if (E.ro.m[i].c === c) return E.ro.m[i]; return null; }
  function mxMine(E) { return mxMem(E, E.myU); }
  function mxModel(E) { return roomModel(E.room); }
  function mxLook(E) { return E.coop ? (E.lk || saneLook(myLook())) : trimLook(E.lk || myLook()); }
  function mxHi(E) {
    var st = myStats();
    return { k: 'lb-hi', n: E.nm, st: { attrs: st.attrs, badges: st.badges, aimSet: myAimSet(), jsetAim: myJsetAim() }, look: mxLook(E), model: mxModel(E), lob: LOBBY, pr: role6Pref() };
  }
  /** Manda un objeto por 'ctl' (JSON); si pasa de CHUNK caracteres, en piezas 'lbk' que el otro lado junta (mxUnchunk). */
  var bigN = 0;
  function mxSend(link, o) {
    if (!link) return;
    var s = JSON.stringify(o);
    if (s.length <= CHUNK) { link.send('ctl', s); return; }
    var id = (++bigN).toString(36) + Date.now().toString(36), n = Math.ceil(s.length / CHUNK);
    for (var i = 0; i < n; i++) link.send('ctl', JSON.stringify({ k: 'lbk', id: id, i: i, n: n, p: s.slice(i * CHUNK, (i + 1) * CHUNK) }));
  }
  function mxParse(d) {
    if (typeof d !== 'string' || d.length > CHUNK * 4) return null;
    try { var c = JSON.parse(d); return c && typeof c === 'object' && typeof c.k === 'string' ? c : null; } catch (e) { return null; }
  }
  /** Junta las piezas 'lbk' (llegan en orden: el canal es fiable y ordenado). Devuelve el mensaje entero o null. Hasta 8 MB. */
  function mxUnchunk(E, c) {
    if (!c || c.k !== 'lbk') return c;
    if (typeof c.id !== 'string' || c.id.length > 40 || !(c.n > 0 && c.n <= 2000) || !(c.i >= 0 && c.i < c.n) || typeof c.p !== 'string') return null;
    var b = E.buf[c.id];
    if (!b) { for (var k in E.buf) if (Date.now() - E.buf[k].t > 60000) delete E.buf[k]; b = E.buf[c.id] = { n: c.n | 0, got: 0, p: [], t: Date.now() }; }
    if (b.p[c.i] == null) { b.p[c.i] = c.p; b.got++; }
    if (b.got < b.n) return null;
    delete E.buf[c.id];
    try { var o = JSON.parse(b.p.join('')); return o && typeof o === 'object' && typeof o.k === 'string' && o.k !== 'lbk' ? o : null; } catch (e) { return null; }
  }
  function mxLobbyMsg(d) { return typeof d === 'string' && (d.lastIndexOf('{"k":"lb', 0) === 0 || d.lastIndexOf('{"k":"cx"', 0) === 0); }

  /* ---- anfitrión ---- */
  function mxHostInit(E) {
    E.ro.m = [{ u: E.myU, n: E.nm, c: E.coop ? 0 : mxPrefChair(E, E.myU, role6Pref()), r: true, h: 1, ok: 1, p: 0 }];
    E.hi[E.myU] = mxHi(E); E.ro.v = 1; mxKits(E);
    if (E.mock) return;
    mxEvery(E, 'poll', ROOM_POLL, function () { mxHostPoll(E); });
    mxEvery(E, 'beat', NR().BEAT_MS, function () { mxBeat(E, false); });
    mxEvery(E, 'pump', PUMP_MS, function () { mxPump(E); });
  }
  /** Latido del anfitrión (lite: 1 escritura, sin releer la sala; el sondeo ya la lee). Con el partido empezado o la coop emparejada,
   *  uno cada PLAY_BEAT_MS. now = true: en el acto (vuelta de la pestaña). */
  function mxBeat(E, now) {
    if (E.closed || E.mock) return;
    var t = Date.now();
    if (!now && (E.started || E.coopOn) && t - (E.beatAt || 0) < PLAY_BEAT_MS - 1000) return;
    E.beatAt = t;
    api().beat(null, { lite: true }).then(function (r) { if (!r && !E.closed && !E.started) mxEnd(E, 'gone'); }, noop);
  }
  /** Sala llena y todos dentro: nadie más puede sentarse (las reglas paran en cap-1) y las salidas llegan por el enlace. */
  function mxAllIn(E) { var n = 0; for (var u in E.peers) if (E.peers[u].ok) n++; return n >= (E.room.cap | 0) - 1; }
  /** Sitio para quien entra: al equipo con menos personas (en el 6v6, su puesto preferido si está libre; si no, receptor). -1 = lleno. */
  function mxPrefChair(E, u, pref) {
    var r = E.room, ps = perSide(r), n = nChairs(r), cnt = [0, 0], free = [], i;
    for (i = 0; i < n; i++) { var m = mxAt(E, i); if (m && m.u !== u) cnt[(i / ps) | 0]++; else free.push(i); }
    if (!free.length) return -1;
    var t0 = E.coop ? 0 : cnt[1] < cnt[0] ? 1 : 0, order = E.coop ? [0] : [t0, 1 - t0];
    // 6v6: su puesto en cualquier equipo que no quede con 2 personas más que el otro
    if (ps === 6 && pref) for (var k0 = 0; k0 < order.length; k0++) {
      var tt = order[k0]; if (!E.coop && cnt[tt] + 1 - cnt[1 - tt] > 1) continue;
      for (var j0 = 0; j0 < free.length; j0++) if (((free[j0] / ps) | 0) === tt && ROLE6_K[free[j0] % ps] === pref) return free[j0];
    }
    for (var k = 0; k < order.length; k++) {
      var fr = free.filter(function (c) { return ((c / ps) | 0) === order[k]; });
      if (!fr.length) continue;
      if (ps === 6) { var want = pref || 'OH'; for (var j = 0; j < fr.length; j++) if (ROLE6_K[fr[j] % ps] === want) return fr[j]; }
      return fr[0];
    }
    return free[0];
  }
  function mxHostPoll(E, now) {
    if (E.closed || E.started || E.attached || E.coopOn) return;   // (coop emparejada: ya no entra nadie; nada de Firestore en los partidos)
    if (mxAllIn(E)) return;   // (sala llena con todos conectados: sin lecturas hasta que alguien salga)
    var t = Date.now();
    if (!now && docHidden() && t - (E.pollAt || 0) < HID_POLL_MS - 500) return;   // (pestaña oculta: cada 6 s)
    // (en una red móvil una lectura puede tardar más que ROOM_POLL: sin esto, una lectura VIEJA que llega después de otra más nueva
    //  soltaba como «se fue» a quien acababa de conectar. Una lectura en vuelo —hasta 10 s— salta el turno; y una respuesta más vieja
    //  que la última aplicada no cuenta)
    if (E.polling && t - E.polling < 10000) return;
    E.pollAt = t; E.polling = t;
    var seq = E.pollSeq = (E.pollSeq | 0) + 1;
    var fin = function () { if (E.pollSeq === seq) E.polling = 0; };
    api().get(E.room.id).then(function (r) {
      fin();
      if (E.closed || E.started || E.attached || E.coopOn) return;
      if (seq < (E.pollOk | 0)) return;
      E.pollOk = seq;
      if (!r) { mxEnd(E, 'gone'); return; }
      E.room = r;
      var seats = r.seats || {}, now = Date.now(), u;
      for (u in seats) if (u !== E.myU && !E.peers[u] && !(E.ban[u] > now)) { if (isBlocked(u) && !E.started) { E.ban[u] = Infinity; if (!E.mock) api().kick(u).catch(noop); continue; } mxConnect(E, u, seats[u] && seats[u].n); }   // (bloqueado: fuera)
      // (se levantó de la sala: leaveMulti o bye; solo si la lectura empezó después de ofrecerle la conexión)
      for (u in E.peers) if (!(u in seats) && E.peers[u].t0 < t) mxRelease(E, u, 'left', true);
      mxCnt(E);
      E.o.onChange(E);
    }, fin);
  }
  /** cnt de la sala = invitados conectados (lo escribe solo el anfitrión, cuando cambia). */
  function mxCnt(E) {
    var n = 0; for (var u in E.peers) if (E.peers[u].ok) n++;
    if (n !== E.cnt) { E.cnt = n; mxCntW(E); }
  }
  /** Escribe cnt de una en una: tres saludos casi a la vez daban tres escrituras en vuelo que podían llegar en otro orden (la sala se
   *  quedaba con cnt 2 teniendo 3 dentro). Con una en vuelo, la siguiente sale al acabar, ya con el último valor. */
  function mxCntW(E) {
    if (E.mock || E.closed) return;
    if (E.cntBusy) { E.cntDirty = true; return; }
    E.cntBusy = true; E.beatAt = Date.now();
    api().beat({ cnt: E.cnt }, { lite: true }).catch(noop).then(function () { E.cntBusy = false; if (E.cntDirty) { E.cntDirty = false; mxCntW(E); } });
  }
  /** Oferta para un invitado recién sentado (en paralelo con los demás: cada pareja con sus temporizadores 'sig:'/'connT:'+uid). */
  function mxConnect(E, u, n) {
    var p = E.peers[u] = { u: u, n: theirName(n, u) || 'Jugador', gen: nextGen(), t0: Date.now(), open: false, ok: false, ans: false, link: null };
    var link = new VB.NetRtc.Link({ iceServers: iceOpt(), onstate: function (s) { if (E.peers[u] === p) mxLinkState(E, u, s); } });
    p.link = E.links[u] = link;
    if (!mxMem(E, u)) E.ro.m.push({ u: u, n: p.n, c: -1, r: false, ok: 0, p: 0 });
    mxBump(E);
    var id = E.room.id;
    link.offer().then(function (sdp) {
      if (E.peers[u] !== p) return;
      return api().putSig(id, 'offer', { sdp: sdp, gen: p.gen }, u).then(function () {
        mxEvery(E, 'sig:' + u, SIG_POLL, function () {
          if (E.peers[u] !== p || p.ans) { mxStop(E, 'sig:' + u); return; }
          api().getSig(id, 'answer', u).then(function (a) {
            if (E.peers[u] !== p || p.ans || !a || a.gen !== p.gen) return;
            p.ans = true; mxStop(E, 'sig:' + u);
            link.accept(a.sdp).catch(function () { if (E.peers[u] === p) mxRelease(E, u, 'noconn'); });
          }, noop);
        });
      });
    }).catch(function () { if (E.peers[u] === p) mxRelease(E, u, 'noconn'); });
    // (no conecta en CONNECT_MS, o abre pero no saluda: se suelta su plaza y su sitio lo lleva la IA; la sala sigue)
    mxAfter(E, 'connT:' + u, CONNECT_MS, function () { if (E.peers[u] === p && !p.ok && !E.started) mxRelease(E, u, 'noconn'); });
  }
  function mxLinkState(E, u, s) {
    var p = E.peers[u]; if (!p) return;
    if (s === 'open') {
      p.open = true; p.rlT0 = 0; E.heard[u] = Date.now(); mxStop(E, 'sig:' + u); mxStop(E, 'relink:' + u); mxStop(E, 'coopDown:' + u);
      if (!E.mock) api().delSig(E.room.id, u).catch(noop);   // (la señalización lleva direcciones de red: fuera en cuanto abre)
    } else if (s === 'down' || s === 'closed') {
      // (coop emparejada entre partidos —E.coopOn, en el hub de la Carrera—: una caída corta también se renegocia, como en pleno
      //  partido; si en COOP_DOWN_MS no vuelve, se acaba la coop)
      if (E.started || E.attached || E.coopOn) {
        if (s === 'down' && E.coopOn && !E.attached) { mxDrain(E, u, p.link); if (E.peers[u] !== p || E.closed) return; }   // (su adiós, si estaba en la cola, cuenta)
        if (s === 'down') { mxRelinkHost(E, u); if (E.coopOn && !E.attached) mxAfter(E, 'coopDown:' + u, COOP_DOWN_MS, function () { if (E.peers[u] === p && !E.attached && p.link.state !== 'open') mxRelease(E, u, 'gone'); }); }
        else if (E.coopOn && !E.attached) { mxDrain(E, u, p.link); if (E.peers[u] === p && !E.closed) mxRelease(E, u, 'gone'); }
      }
      else { mxDrain(E, u, p.link); if (E.peers[u] === p && !E.closed) mxRelease(E, u, p.ok ? 'gone' : 'noconn'); }   // (su adiós puede estar aún en la cola)
    }
  }
  /** Suelta a un invitado: why = 'left' (salió) | 'kick' (lo saca el anfitrión) | 'noconn' (no llegó a conectar) | 'gone' (se cayó)
   *  | 'nostart' (estaba de pie al empezar) | 'mismatch'. Su sitio vuelve a ser de la IA; noKick: ya no está sentado en la sala. */
  function mxRelease(E, u, why, noKick) {
    var p = E.peers[u], m = mxMem(E, u);
    if (why === 'noconn' && p && !E.started && !E.attached) mxPrefail(E, p.link, why, Date.now() - p.t0);   // (lane A: antes de cerrar el enlace)
    mxStop(E, 'sig:' + u); mxStop(E, 'connT:' + u); mxStop(E, 'relink:' + u); mxStop(E, 'coopDown:' + u);
    delete E.peers[u]; delete E.links[u]; delete E.hi[u]; delete E.heard[u];
    if (p && p.link) {
      var lk = p.link; lk.onclose = null; lk.onstate = null;
      if (lk.state === 'open' && (why === 'kick' || why === 'nostart' || why === 'mismatch')) { try { lk.send('ctl', JSON.stringify({ k: 'lb-out', why: why })); } catch (e) { } setTimeout(function () { lk.close(); }, 400); }
      else lk.close();
    }
    if (m) E.ro.m = E.ro.m.filter(function (x) { return x.u !== u; });
    // (que el siguiente sondeo no le vuelva a ofrecer mientras la sala aún lo tiene sentado; si salió él, un veto corto, más largo que la
    //  ida y vuelta de un sondeo: una lectura que ya iba de camino aún lo trae sentado y no hay que ofrecerle otra vez)
    //  A quien saca el anfitrión, el veto dura toda la sala (además, rooms.kick lo apunta en ban y las reglas no le dejan sentarse)
    E.ban[u] = why === 'kick' ? Infinity : Date.now() + (why === 'left' ? LEFT_BAN_MS : BAN_MS);
    if (!E.mock && !E.closed) { if (!noKick) api().kick(u).catch(noop); api().delSig(E.room.id, u).catch(noop); }
    if ((why === 'noconn' || why === 'gone') && E.o.onNote) E.o.onNote((m ? m.n : 'Alguien') + (why === 'noconn' ? ' no ha podido conectar: su sitio lo lleva la IA.' : ' se ha desconectado.'), true, E);
    if (E.closed) return;
    if (E.coop) { mxEnd(E, why === 'left' ? 'mateLeft' : why); return; }   // (coop: sin compañero no hay sala)
    mxCnt(E); mxBump(E);
  }
  /** Enlace caído de un invitado en pleno partido: el anfitrión le vuelve a ofrecer (a los 0,6 s, cada 10 s el primer minuto y luego cada
   *  20 s). (revisión: por TIEMPO y no por 7 intentos —~60 s—: mientras el invitado aún puede volver tras recargar, MX_BACK_HOST_MS en el
   *  modelo anfitrión y MX_BACK_MS en Precisa-N y la coop, más RELINK_PAD de lo que tarda su página en cargar y ponerse a escuchar. Antes,
   *  en el 6v6 un invitado que volvía entre los ~70 s y los 120 s esperaba a una oferta que ya no llegaba. La hora de la primera caída
   *  queda en el par: un 'down' de nuevo no alarga la ventana.) */
  var RELINK_PAD = 15000, RELINK_SLOW_MS = 60000;
  function mxRelinkHost(E, u) {
    var p = E.peers[u]; if (!p) return;
    if (!p.rlT0) p.rlT0 = Date.now();
    var t0 = p.rlT0, lim = (roomModel(E.room) === 'host' ? MX_BACK_HOST_MS : MX_BACK_MS) + RELINK_PAD, k = 0;
    var go = function () {
      if (E.peers[u] !== p || E.closed || !p.link || p.link.state === 'open' || p.link.state === 'closed' || Date.now() - t0 > lim) { mxStop(E, 'relink:' + u); return; }
      var late = Date.now() - t0 > RELINK_SLOW_MS;
      if (late && (k++ & 1)) return;   // (pasado el primer minuto, una de cada dos: cada 20 s)
      var win = late ? 19000 : 9000;   // (se mira la respuesta hasta casi la oferta siguiente)
      var gen = p.gen = nextGen(), link = p.link, id = E.room.id;
      link.offer().then(function (sdp) { return api().putSig(id, 'offer', { sdp: sdp, gen: gen }, u); }).then(function () {
        var t1 = Date.now();
        mxEvery(E, 'sig:' + u, SIG_POLL, function () {
          if (p.gen !== gen || link.state === 'open' || Date.now() - t1 > win) { mxStop(E, 'sig:' + u); return; }
          api().getSig(id, 'answer', u).then(function (a) { if (a && a.gen === gen && p.gen === gen) { mxStop(E, 'sig:' + u); link.accept(a.sdp).catch(noop); } }, noop);
        });
      }).catch(noop);
    };
    mxStop(E, 'relink:' + u); setTimeout(go, 600); mxEvery(E, 'relink:' + u, 10000, go);
  }
  /** Camisetas de los dos equipos para las columnas (las mismas que main.js netKitMulti: la del primer humano de cada equipo, en el
   *  orden de las plazas, por VB.Players.onlineKits). */
  function mxKits(E) {
    var cap = [null, null], P2 = VB.Players, L2 = mxOrder(E);
    for (var i = 0; i < L2.length; i++) { var t = chairOf(E.room, L2[i].c).t, hi = E.hi[L2[i].u]; if (!cap[t] && hi && hi.look && hi.look.kit) cap[t] = hi.look.kit; }
    var ks = P2 && P2.onlineKits ? safe(function () { return P2.onlineKits(cap[0], cap[1]); }) : null;
    E.ro.ko = ks ? [ks[0].kitShirt | 0, ks[1].kitShirt | 0] : null;
  }
  /** Sentados en el orden de las plazas de la sim: el anfitrión el primero y los demás por sitio. */
  function mxOrder(E) {
    return E.ro.m.filter(function (m) { return m.c >= 0; }).sort(function (a, b) { return a.h ? -1 : b.h ? 1 : a.c - b.c; });
  }
  function mxBump(E) { E.ro.v++; mxKits(E); mxBcast(E); if (E.o.onChange) E.o.onChange(E); }
  function mxBcast(E) {
    if (E.role !== 'host' || E.mock) return;
    E.roAt = Date.now(); E.roDirty = false;
    var msg = { k: 'lb', ro: E.ro };
    for (var u in E.peers) { var p = E.peers[u]; if (p.ok && p.link && p.link.state === 'open') mxSend(p.link, msg); }
  }
  /** Lista de la sala que manda el anfitrión, saneada (nombres, sitios dentro de la sala, como mucho cap personas). */
  function mxSaneRo(E, ro) {
    if (!ro || typeof ro !== 'object' || !Array.isArray(ro.m)) return null;
    var n = nChairs(E.room), out = { v: ro.v | 0, m: [], ko: null }, used = {};
    if (Array.isArray(ro.ko) && ro.ko.length === 2) out.ko = [ro.ko[0] & 0xffffff, ro.ko[1] & 0xffffff];
    ro.m.slice(0, Math.max(2, E.room.cap | 0)).forEach(function (x) {
      if (!x || typeof x.u !== 'string' || x.u.length > 128 || used[x.u]) return;
      var c = Math.floor(+x.c); if (!(c >= 0 && c < n)) c = -1;
      used[x.u] = 1;
      out.m.push({ u: x.u, n: theirName(x.n, x.u) || 'Jugador', c: c, r: !!x.r && c >= 0, p: Math.max(0, Math.min(9999, x.p | 0)), h: x.h ? 1 : 0, ok: x.ok ? 1 : 0 });
    });
    return out;
  }

  /* ---- los dos lados: leer los enlaces (antes del partido) y el latido ---- */
  function mxPump(E) {
    if (E.closed || E.attached || E.started) return;
    var now = Date.now(), host = E.role === 'host', us = host ? Object.keys(E.peers) : [E.room.host];
    for (var i = 0; i < us.length; i++) {
      var u = us[i], link = host ? E.peers[u] && E.peers[u].link : E.hostLink;
      if (!link || link.state !== 'open') continue;
      var ms = link.poll();
      for (var j = 0; j < ms.length; j++) {
        if (ms[j].ch !== 'ctl') continue;
        var c = mxUnchunk(E, mxParse(ms[j].data));
        if (c) mxMsg(E, u, c, now);
        // (un 'lb-go' arranca el partido o la sala se cierra: lo que quede en el lote es de la sesión, vuelve a la cola del enlace)
        if (E.closed || E.started || E.attached) { if (!E.closed) link.q = ms.slice(j + 1).concat(link.q); return; }
      }
    }
    if (now - E.lastPing < KEEP_MS) return;
    E.lastPing = now;
    if (host) {
      for (var u2 in E.peers) {
        var p = E.peers[u2]; if (!p.open || !p.link || p.link.state !== 'open') continue;
        mxSend(p.link, { k: 'lb-ping', t: now });
        if (!docHidden() && now - (E.heard[u2] || now) > (E.away[u2] ? AWAY_MS : DEAD_MS)) mxRelease(E, u2, 'gone');   // (sin noticias: se cayó sin avisar)
      }
      if (E.roDirty && now - E.roAt > RO_PING_MS) { mxBcast(E); E.o.onChange(E); }   // (los pings, cada 2 s como mucho)
    } else if (!docHidden() && E.hostLink && E.hostLink.state === 'open' && now - (E.heard.host || now) > (E.away.host ? AWAY_MS : DEAD_MS)) mxEnd(E, 'hostLost');
  }
  function docHidden() { return typeof document !== 'undefined' && !!document.hidden; }
  /** La página se oculta o vuelve (antes de empezar): aviso a los demás y, al volver, el silencio de mientras no cuenta. */
  function mxVis(E) {
    if (!E || E.closed || E.mock || E.started || E.attached) return;
    var hid = docHidden(), now = Date.now(), msg = { k: 'lb-away', a: hid ? 1 : 0 };
    mxLinksOf(E).forEach(function (k) { if (k.state === 'open') mxSend(k, msg); });
    if (!hid) {
      for (var u in E.heard) E.heard[u] = now; E.lastPing = 0;
      // (anfitrión de vuelta: la pestaña oculta pudo frenar el sondeo y el latido; se ponen al día en el acto)
      if (E.role === 'host' && !E.coopOn) { mxHostPoll(E, true); mxBeat(E, true); }
    }
  }
  /** Lee lo que quede en la cola de un enlace que se acaba de caer (antes del partido): el adiós o el «te sacan» llegan antes. */
  function mxDrain(E, u, link) {
    if (!link || E.attached || E.started) return;
    var ms = link.poll(), t = Date.now();
    for (var i = 0; i < ms.length && !E.closed; i++) {
      if (ms[i].ch !== 'ctl') continue;
      var c = mxUnchunk(E, mxParse(ms[i].data)); if (c) mxMsg(E, u, c, t);
      // (como en mxPump: tras un 'lb-go' lo que queda es de la sesión del partido —el hola con las opciones—, vuelve a la cola)
      if (E.started || E.attached) { if (!E.closed) link.q = ms.slice(i + 1).concat(link.q); return; }
    }
  }
  function mxMsg(E, u, c, now) {
    var host = E.role === 'host';
    E.heard[host ? u : 'host'] = now;
    if (c.k === 'cx') { coopIn(E, c.d); return; }
    if (c.k === 'lb-away') { E.away[host ? u : 'host'] = c.a ? now : 0; return; }   // (se fue a otra app / volvió)
    if (host) {
      var p = E.peers[u], m = mxMem(E, u); if (!p) return;
      if (c.k === 'lb-pong') { var rt = now - (+c.t || 0); if (m && rt >= 0 && rt < 10000) { if (Math.abs(rt - (m.p | 0)) > 8) E.roDirty = true; m.p = rt; } return; }
      if (c.k === 'lb-hi') {
        if ((c.model === 'host' || c.model === 'fluida' ? c.model : 'precisa') !== mxModel(E)) { mxRelease(E, u, 'mismatch'); return; }
        var st = c.st && typeof c.st === 'object' ? c.st : {};
        E.hi[u] = { st: { attrs: sanAttrs(st.attrs), badges: sanBadges(st.badges), aimSet: st.aimSet !== false, jsetAim: st.jsetAim === true }, look: E.coop ? saneLook(c.look) : trimLook(c.look) };
        var first = !p.ok; p.ok = true; mxStop(E, 'connT:' + u);
        if (m) { m.n = theirName(c.n, u) || p.n; m.ok = 1; if (m.c < 0 && first) m.c = mxPrefChair(E, u, ROLE6_K.indexOf(c.pr) >= 0 ? c.pr : ''); }
        mxCnt(E); mxBump(E);
        if (E.coop) { mxSend(p.link, mxHi(E)); coopReady(E, u); }
        return;
      }
      if (!m || !p.ok || E.started) return;
      if (c.k === 'lb-sit') { var cc = Math.floor(+c.c); if (cc === -1) { m.c = -1; m.r = false; } else if (cc >= 0 && cc < nChairs(E.room) && !mxAt(E, cc)) m.c = cc; mxBump(E); return; }
      if (c.k === 'lb-rdy') { m.r = !!c.r && m.c >= 0; mxBump(E); return; }
      if (c.k === 'lb-bye') { var nm = m.n; mxRelease(E, u, 'left', false); if (E.o.onNote && !E.closed) E.o.onNote(nm + ' ha salido de la sala.', false, E); return; }
      return;
    }
    // invitado: lo que manda el anfitrión
    if (c.k === 'lb') { var ro = mxSaneRo(E, c.ro); if (ro) { E.ro = ro; E.o.onChange(E); } return; }
    if (c.k === 'lb-ping') { if (E.hostLink) mxSend(E.hostLink, { k: 'lb-pong', t: c.t }); return; }
    if (c.k === 'lb-hi') { E.hi.host = { n: theirName(c.n, E.room && E.room.host) || '', look: E.coop ? saneLook(c.look) : trimLook(c.look) }; if (E.coop) coopReady(E, E.room.host); return; }
    if (c.k === 'lb-out') { mxEnd(E, c.why === 'kick' || c.why === 'nostart' || c.why === 'mismatch' ? c.why : 'out'); return; }
    if (c.k === 'lb-bye') { mxEnd(E, 'hostLeft'); return; }
    if (c.k === 'lb-go' && !E.started && E.o.onGo) E.o.onGo(c, E);
  }

  /* ---- invitado ---- */
  function mxGuestInit(E) {
    if (E.mock) return;
    mxGuestListen(E, 0);
    mxEvery(E, 'poll', 3000, function () { mxGuestPoll(E); });
    mxEvery(E, 'pump', PUMP_MS, function () { mxPump(E); });
    // (como en el 1 contra 1: la oferta llega en 2-4 s; sin ella y sin latido de la sala, «no responde»)
    var tJoin = E.tJoin = Date.now();
    mxAfter(E, 'offerT', OFFER_MS, function chk() {
      if (E.closed || E.started || E.gotOffer) return;
      if (Date.now() - tJoin > MX_OFFER_MAX) { mxEnd(E, 'noHost'); return; }
      api().get(E.room.id).then(function (r2) {
        if (E.closed || E.started || E.gotOffer) return;
        if (r2 && r2.state === 'play') mxEnd(E, 'late');
        else if (r2 && r2.age > MX_STALE_MS) mxEnd(E, 'noHost'); else mxAfter(E, 'offerT', 5000, chk);
      }, function () { mxAfter(E, 'offerT', 5000, chk); });
    });
  }
  /** Espera una oferta de generación nueva en sig/o_<tu uid> y contesta (también para renegociar en pleno partido). */
  function mxGuestListen(E, minGen) {
    var id = E.room.id, seen = minGen;
    mxEvery(E, 'sig', SIG_POLL, function () {
      if (E.closed) { mxStop(E, 'sig'); return; }
      if (E.hostLink && E.hostLink.state === 'open' && !(E.started && netWaiting())) return;
      if (E.started && netEnded()) return;   // (lane A: partido acabado del todo —'ended'—: ya no hay nada que renegociar)
      api().getSig(id, 'offer', E.myU).then(function (o) {
        if (!o || o.gen <= seen || E.closed) return;
        seen = o.gen; E.gen = o.gen;
        if (!E.gotOffer && !E.started) {
          E.gotOffer = true; mxStop(E, 'offerT');
          mxAfter(E, 'connT', CONNECT_MS + 5000, function () { if (!E.closed && !E.started && !E.hiSent) mxEnd(E, 'noconn'); });
        }
        var link = (E.started || E.attached || E.coopOn) && E.hostLink ? E.hostLink : mxNewHostLink(E);
        link.answer(o.sdp).then(function (sdp) { return api().putSig(id, 'answer', { sdp: sdp, gen: o.gen }, E.myU); }).catch(noop);
      }, noop);
    });
  }
  function mxNewHostLink(E) {
    if (E.hostLink) { var o = E.hostLink; o.onstate = null; o.onclose = null; o.close(); }
    var link = new VB.NetRtc.Link({ iceServers: iceOpt(), onstate: function (s) { if (E.hostLink === link) mxGuestLinkState(E, s); } });
    E.hostLink = link; E.links = {}; E.links[E.room.host] = link;
    return link;
  }
  function mxGuestLinkState(E, s) {
    if (s === 'open') {
      E.heard.host = Date.now(); mxStop(E, 'coopDown'); mxStop(E, 'hostChk');
      if (E.back && !E.backGo) { mxBackOpen(E); return; }   // (lane A: vuelta tras recargar: con el enlace abierto empieza la sesión)
      if (E.started || E.attached || E.closed || E.coopOn) return;
      mxStop(E, 'poll'); mxStop(E, 'offerT'); mxStop(E, 'connT');   // (desde aquí, nada de Firestore: todo va por el enlace)
      E.status = 'linked'; E.hiSent = true; mxSend(E.hostLink, mxHi(E));
      E.o.onChange(E);
    } else if (s === 'down' || s === 'closed') {
      if (E.started || E.attached || E.coopOn) {
        if (s === 'down' && E.coopOn && !E.attached) { mxDrain(E, E.room.host, E.hostLink); if (E.closed) return; }   // (un 'lb-bye' en la cola cuenta)
        if (s === 'down') {
          mxGuestListen(E, E.gen);   // (la escucha de ofertas: el anfitrión renegocia; también entre partidos de la coop)
          mxHostChk(E);   // (lane A: si quien creó la sala recargó o cerró, su sala ya no existe: se acaba sin esperar 60 s)
          if (E.coopOn && !E.attached) mxAfter(E, 'coopDown', COOP_DOWN_MS, function () { if (!E.closed && !E.attached && (!E.hostLink || E.hostLink.state !== 'open')) mxEnd(E, 'hostLost'); });
        } else if (E.coopOn && !E.attached && !E.closed) { mxDrain(E, E.room.host, E.hostLink); if (!E.closed) mxEnd(E, 'hostLost'); }
      }
      else {
        mxDrain(E, E.room.host, E.hostLink);   // (un 'lb-bye' / 'lb-out' que llegó justo antes cuenta)
        // (un 'lb-go' en la cola: el partido ya ha empezado y el enlace se renegocia como en pleno partido)
        if (E.started || E.attached) { if (s === 'down' && !E.closed) mxGuestListen(E, E.gen); return; }
        if (!E.closed) mxEnd(E, 'hostLost');
      }
    }
  }
  function mxGuestPoll(E) {
    if (E.closed || E.started || (E.hostLink && E.hostLink.state === 'open')) return;
    api().get(E.room.id).then(function (r) {
      if (E.closed || E.started || (E.hostLink && E.hostLink.state === 'open')) return;
      if (!r || r.age > NR().LIVE_MS) { mxEnd(E, 'hostLeft'); return; }
      if (r.state === 'play' && !E.started) { mxEnd(E, 'late'); return; }   // (empezó sin mí: me senté justo antes de «Empezar»)
      if (!(E.myU in (r.seats || {}))) { mxEnd(E, E.gotOffer ? 'noconn' : 'out'); return; }
      E.room = r; E.o.onChange(E);
    }, noop);
  }

  /* ---- fin, salida y arranque ---- */
  function mxLinksOf(E) { var o = []; if (E.role === 'host') { for (var u in E.peers) if (E.peers[u].link) o.push(E.peers[u].link); } else if (E.hostLink) o.push(E.hostLink); return o; }
  function mxCloseLinks(E) { mxLinksOf(E).forEach(function (k) { k.onclose = null; k.onstate = null; try { k.close(); } catch (e) { } }); }
  /** La sala se acaba sin que lo pidas (te sacan, se cierra, se cae…): limpia y avisa (onEnd). */
  function mxEnd(E, why) {
    if (E.closed) return;
    if (E.role === 'guest' && !E.started && !E.attached && (why === 'noconn' || why === 'hostLost')) mxPrefail(E, E.hostLink, why, Date.now() - (E.tJoin || Date.now()));
    E.closed = true; mxStopAll(E);
    if (!E.started) mxCloseLinks(E);
    if (!E.mock) { if (E.role === 'host') api().close(); else if (!E.started) api().leave(E.room.id); }
    if (E.o.onEnd) E.o.onEnd(why, E);
  }
  /** Sales tú (botón, Esc, coop.close): el adiós por los enlaces, la sala o tu plaza fuera. Sin onEnd. */
  function mxLeave(E) {
    if (E.closed) return;
    var bye = JSON.stringify({ k: 'lb-bye' });
    mxLinksOf(E).forEach(function (k) { if (k.state === 'open') { try { k.send('ctl', bye); } catch (e) { } } });
    E.closed = true; mxStopAll(E);
    mxCloseLinks(E);   // (Link.close espera a que salga el adiós si el canal aún está mandando)
    if (!E.mock) { if (E.role === 'host') api().close(); else api().leave(E.room.id); }
  }
  /** Al cerrar la pestaña (pagehide): el adiós y la sala o la plaza con fetch keepalive, sin esperar. */
  function mxBye(E) {
    if (E.closed || E.mock) return;
    var bye = JSON.stringify({ k: 'lb-bye' });
    mxLinksOf(E).forEach(function (k) { if (k.state === 'open') { try { k.send('ctl', bye); } catch (e) { } } });
    if (rooms) { try { rooms.bye(E.role, E.room.id, true); } catch (e) { } }
  }
  /** Un enlace del partido se cerró (main.js netStop al acabar): cuando no queda ninguno, la sala se cierra. */
  function mxLinkGone(E, u) {
    delete E.links[u];
    if (E.role === 'host' && E.peers[u]) { mxStop(E, 'relink:' + u); mxStop(E, 'sig:' + u); delete E.peers[u]; }
    if ((E.role === 'host' && Object.keys(E.peers).length) || E.closed) return;
    E.closed = true; mxStopAll(E);
    if (E.role === 'host' && !E.mock) api().close();
    if (E.o.onEnd) E.o.onEnd('over', E);
  }
  /** ¿Puede empezar? Todos los que están dentro (conectados), sentados y listos; al menos otra persona. Los que aún conectan no
   *  frenan: si no llegan, la IA lleva su sitio. */
  function mxCanStart(E) {
    var n = 0, wait = [];
    for (var i = 0; i < E.ro.m.length; i++) {
      var m = E.ro.m[i]; if (m.h || !m.ok) continue;
      if (m.c < 0 || !m.r) wait.push(m.n); else n++;
    }
    return { ok: n > 0 && !wait.length && !E.started, wait: wait, n: n };
  }
  /** Anfitrión: reparte las plazas y manda 'lb-go' a cada invitado sentado. → {humans, links, us, opts, model, fmt} para startOnline. */
  function mxGo(E) {
    var r = E.room, even = !!r.even, seated = mxOrder(E).filter(function (m) { return m.h || (m.ok && E.peers[m.u]); });
    var us = seated.map(function (m) { return m.u; });
    // los que no juegan: dentro pero de pie → fuera; aún conectando → se sueltan (su sitio, la IA)
    Object.keys(E.peers).forEach(function (u) { if (us.indexOf(u) < 0) mxRelease(E, u, E.peers[u].ok ? 'nostart' : 'noconn'); });
    var seed = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] >>> 1 : Math.floor(Math.random() * 2147483647);
    var hum = [], simH = [], looks = [], links = [];
    seated.forEach(function (m) {
      var q = chairOf(r, m.c), hi = E.hi[m.u] || {}, st = hi.st || {};
      hum.push({ team: q.t, idx: q.i, name: m.n }); looks.push(hi.look || null);
      var h = { team: q.t, idx: q.i, aimSet: st.aimSet !== false, jsetAim: st.jsetAim === true };
      if (!even) { if (st.attrs) h.attrs = st.attrs; if (st.badges) h.badges = st.badges; }
      simH.push(h);
      if (!m.h) links.push(E.peers[m.u].link);
    });
    var opts = { online: true, seed: seed, venue: r.venue === 'beach' ? 'beach' : 'hall', mapId: r.map || '', bestOf: r.bo === 3 ? 3 : 1, points: r.pts || 21, even: even,
      present: true, stats: true, djump: true, format: r.fmt === '6v6' ? '6v6' : '2v2', humans: simH };
    if (E.coop) opts.coop = true;
    var go = { k: 'lb-go', us: us, humans: hum, looks: looks, seed: seed, opts: opts, model: mxModel(E), fmt: opts.format };
    E.started = true;
    links.forEach(function (k) { mxSend(k, go); });
    mxStopAll(E, ['beat']);
    // (quien se sentó en Firestore en el último hueco del sondeo nunca llegó a E.peers: la sala ya en 'play' no admite a nadie más y la
    //  lectura que devuelve el latido trae los sentados de verdad; los que no juegan se levantan, y su lobby lo ve en mxGuestPoll)
    if (!E.mock) api().beat({ state: 'play', cnt: links.length }).then(function (r2) {
      var st2 = (r2 && r2.seats) || {};
      for (var u2 in st2) if (u2 !== E.myU && us.indexOf(u2) < 0) api().kick(u2).catch(noop);
    }).catch(noop);
    return { humans: hum.map(function (h, s) { return { team: h.team, idx: h.idx, name: h.name, look: looks[s] }; }), links: links, us: us, opts: opts, model: go.model, fmt: go.fmt };
  }

  /* ---- el lobby (#mpOnline) con una sala de varios ---- */
  function mxWhy(why, E) {
    var who = (E && E.room && E.room.name) || 'El que ha creado la sala';
    return {
      hostLeft: who + ' ha cerrado la sala.', hostLost: 'Se ha perdido la conexión con la sala de ' + who + '.', kick: who + ' te ha sacado de la sala.',
      noconn: 'No se ha podido conectar con la sala: vuestras redes no lo permiten. Probad otra vez o desde otra red.',
      noHost: who + ' no responde: parece que ya no está en la sala. Prueba con otra.', gone: 'Tu sala se ha cerrado.',
      nostart: 'La partida ha empezado sin ti (estabas de pie).', late: 'La partida ha empezado justo cuando entrabas: prueba con otra sala.', mismatch: 'La sala no coincide con lo anunciado: no hay partido.',
      out: 'Ya no tienes sitio en esa sala.', error: 'No ha salido. Prueba otra vez.'
    }[why] || 'La sala se ha cerrado.';
  }
  function mCreate(c) {
    var six = c.fmt === '6v6', venue = six ? 'hall' : c.venue, map = venue === 'beach' ? c.mapB : c.mapH;
    L.msg = ''; L.busy = true; render();
    api().open({ name: myName(), venue: venue, map: map, bo: c.bo, even: c.even, pts: venue === 'beach' ? 21 : c.pts, mode: 'vs', cap: six ? 12 : 4, fmt: six ? '6v6' : '2v2' }).then(function (r) {
      L.busy = false;
      if (!r || !r.multi) throw { code: r ? 'denied' : 'error' };
      L.room = r; L.role = 'host'; L.rival = ''; L.fail = ''; L.started = false; L.status = 'wait'; L.pick = '';
      L.mx = Mx({ role: 'host', room: r, onChange: mChange, onNote: mNote, onEnd: mEnd });
      mxHostInit(L.mx);
      // (lane A: el consejo del 6 contra 6 para quien crea la sala, en una línea; en el móvil la nota de «Crear sala» no se ve, así que
      //  sale aquí: aviso de arriba en el móvil, nota de la sala en PC)
      if (six) { L.msg = 'Mejor desde un ordenador o con wifi.'; L.msgBad = false; }
      setView('room');
    }).catch(function (e) {
      L.busy = false;
      if (e && e.code === 'off') { setView('off'); return; }
      // (reglas del esquema v3 sin desplegar: crear una sala de varios da 'denied'; el 1 contra 1 sigue igual)
      L.msg = e && e.code === 'denied' ? 'Las salas de varios aún no están activadas.' : errText(e, 'No se ha podido crear la sala.'); L.msgBad = true; render();
    });
  }
  function mJoined(r) {
    L.room = r; L.role = 'guest'; L.rival = theirName(r.name, r.host) || 'Rival'; L.fail = ''; L.started = false; L.status = 'connecting'; L.pick = '';
    L.mx = Mx({ role: 'guest', room: r, onChange: mChange, onNote: mNote, onEnd: mEnd, onGo: mGuestGo });
    mxGuestInit(L.mx);
    setView('room'); sound('click');
  }
  function mChange(E) { if (L.mx !== E) return; L.room = E.room; if (L.pick && !mxMem(E, L.pick)) L.pick = ''; render(); }
  function mNote(t, bad, E) { if (L.mx !== E) return; L.msg = t; L.msgBad = !!bad; render(); }
  function mEnd(why, E) {
    if (L.mx !== E) return;
    var was = L.started;
    L.mx = null; stopAll(); L.room = null; L.role = ''; L.rival = ''; L.status = ''; L.started = false; L.pick = '';
    if (was || why === 'over') { L.view = 'list'; return; }
    L.msg = mxWhy(why, E); L.msgBad = true;
    if (L.on) { setView('list'); refreshList(false); }
  }
  function mStart() {
    var E = L.mx, C = ctx(); if (!E || E.role !== 'host' || E.started) return;
    var cs = mxCanStart(E);
    if (!cs.ok) { L.msg = cs.wait.length ? 'Faltan por estar listos: ' + cs.wait.join(', ') + '.' : 'Espera a que entre alguien más.'; L.msgBad = false; render(); return; }
    if (!C || !C.actions || !C.actions.startOnline) return;
    L.pick = '';
    var g = mxGo(E);
    L.started = true; L.status = 'play'; stopAll();
    g.links.forEach(function (k, i) { var u = g.us[i + 1]; k.onclose = function () { mxLinkGone(E, u); }; });
    // (linkSeats[j] = plaza del enlace j: P2 la sabe también por el saludo de cada invitado; main.js la pasa si la reenvía)
    var ok = C.actions.startOnline({ humans: g.humans, seat: 0, links: g.links, linkSeats: g.links.map(function (k, i) { return i + 1; }), opts: g.opts, name: myName(), model: g.model, format: g.fmt, expect: null });
    if (!ok) { L.started = false; mxEnd(E, 'error'); return; }
    render();
  }
  function mGuestGo(c, E) {
    var C = ctx(), r = E.room, us = Array.isArray(c.us) ? c.us : [], seat = us.indexOf(E.myU), H = Array.isArray(c.humans) ? c.humans : [], n = us.length;
    if (seat < 1 || n > (r.cap | 0) || H.length !== n) { mxEnd(E, 'out'); return; }
    var model = roomModel(r);
    if ((c.model === 'host' || c.model === 'fluida' ? c.model : 'precisa') !== model) { mxEnd(E, 'mismatch'); return; }
    if (!C || !C.actions || !C.actions.startOnline) { mxEnd(E, 'error'); return; }
    var ps = perSide(r), humans = [];
    for (var s = 0; s < n; s++) {
      var h = H[s] || {};
      humans.push({ team: h.team === 1 && r.mode !== 'coop' ? 1 : 0, idx: Math.max(0, Math.min(ps - 1, h.idx | 0)), name: theirName(h.name) || 'Jugador ' + (s + 1),
        look: s === seat ? mxLook(E) : saneLook(Array.isArray(c.looks) ? c.looks[s] : null) });
    }
    E.started = true; L.started = true; L.status = 'play';
    mxStopAll(E, ['sig']);   // (la escucha de ofertas sigue para renegociar si el enlace cae; con él abierto no lee nada)
    var link = E.hostLink;
    link.onclose = function () { mxLinkGone(E, r.host); };
    var expect = { even: !!r.even, bestOf: r.bo === 3 ? 3 : 1, points: r.pts || 21, venue: r.venue === 'beach' ? 'beach' : 'hall' };
    var ok = C.actions.startOnline({ humans: humans, seat: seat, links: [link], opts: null, name: myName(), model: model, format: r.fmt === '6v6' ? '6v6' : '2v2', expect: expect });
    if (!ok) { E.started = false; L.started = false; mxEnd(E, 'error'); return; }
    render();
  }
  function mChair(c) {
    var E = L.mx; if (!E || E.started || L.started || !(c >= 0 && c < nChairs(E.room))) return;
    var at = mxAt(E, c), me = mxMine(E);
    if (E.role === 'host') {
      if (L.pick) {   // (anfitrión con alguien elegido: lo pone ahí; si el sitio está ocupado, se cambian)
        var pm = mxMem(E, L.pick); L.pick = '';
        if (pm && at !== pm) { if (at) { at.c = pm.c; if (at.c < 0) at.r = false; } pm.c = c; mxBump(E); } else render();
        return;
      }
      if (!at) { if (me) { me.c = c; mxBump(E); } return; }
      if (at.h) return;
      L.pick = at.u; render(); return;
    }
    if (!me || !E.hostLink || E.hostLink.state !== 'open') return;
    if (at && at.u === me.u) { me.c = -1; me.r = false; mxSend(E.hostLink, { k: 'lb-sit', c: -1 }); }   // (tu sitio: te levantas)
    else if (!at) { me.c = c; mxSend(E.hostLink, { k: 'lb-sit', c: c }); }
    render();
  }
  function mPick(u) { var E = L.mx; if (!E || E.role !== 'host' || E.started) return; L.pick = L.pick === u ? '' : u; render(); }
  function mReady() {
    var E = L.mx, me = E && mxMine(E); if (!E || E.role !== 'guest' || !me || me.c < 0 || !E.hostLink || E.hostLink.state !== 'open') return;
    me.r = !me.r; mxSend(E.hostLink, { k: 'lb-rdy', r: me.r }); render(); focusA('ready');
  }
  function mSwap() {
    var E = L.mx; if (!E || E.role !== 'host' || E.started || E.coop) return;
    var ps = perSide(E.room); E.ro.m.forEach(function (m) { if (m.c >= 0) m.c = (m.c + ps) % (2 * ps); });
    L.pick = ''; mxBump(E);
  }
  function mKick() { var E = L.mx; if (!E || E.role !== 'host' || !L.pick || E.started) return; var u = L.pick; L.pick = ''; mxRelease(E, u, 'kick'); render(); focusA('leave'); }
  function mStatus(E) {
    if (L.started) return 'Empieza el partido…';
    var me = mxMine(E);
    if (E.role === 'host') {
      if (L.pick) { var pm = mxMem(E, L.pick); return 'Toca un sitio para poner a ' + (pm ? pm.n : '…') + ' (o pulsa «Sacar de la sala»).'; }
      var conn = E.ro.m.filter(function (m) { return !m.ok; }).map(function (m) { return m.n; }), cs = mxCanStart(E);
      if (!cs.n && !cs.wait.length) return conn.length ? 'Conectando con ' + conn.join(', ') + '…' : 'Esperando jugadores. Tu sala sale en la lista de Online.';
      if (cs.wait.length) return 'Faltan por estar listos: ' + mNames(cs.wait) + '.';
      return conn.length ? 'Casi: falta que conecte ' + conn.join(', ') + '.' : 'Estáis todos. Cuando quieras, «Empezar».';
    }
    if (E.status !== 'linked') return 'Conectando con la sala de ' + (E.room.name || '…') + '…';
    if (!me) return 'Entrando en la sala…';
    if (me.c < 0) return 'Toca un sitio libre para sentarte.';
    return me.r ? 'Listo. Esperando a que ' + (E.room.name || 'el que la ha creado') + ' pulse «Empezar».' : 'Toca otro sitio para cambiarte o pulsa «Listo».';
  }
  /** «Ana, Luis» · «Ana, Luis y 3 más» (la barra del móvil tiene sitio para dos líneas). */
  function mNames(L2) { return L2.length <= 2 ? L2.join(', ') : L2.slice(0, 2).join(', ') + ' y ' + (L2.length - 2) + ' más'; }
  function hexCol(v, d) { return typeof v === 'number' && isFinite(v) ? '#' + ('00000' + (v & 0xffffff).toString(16)).slice(-6) : d; }
  function mChip(E, c, me) {
    var r = E.room, m = mxAt(E, c), mine = !!(m && me && m.u === me.u), host = E.role === 'host', role = chairRole(r, c), num = dorsal(r, c);
    var can = !L.started && (host ? (!m || !m.h || !!L.pick) : E.status === 'linked' && !!me && (!m || mine));
    var cls = 'mx-chip' + (m ? '' : ' empty') + (mine ? ' me' : '') + (m && (m.r || m.h) ? ' rdy' : '') + (m && L.pick === m.u ? ' pick' : '') + (m && !m.ok ? ' conn' : '');
    var ping = m && !m.h && m.ok && m.p ? '<i class="mx-ping ' + (m.p < 90 ? 'g' : m.p < 170 ? 'y' : 'r') + '" aria-hidden="true"></i>' : '';   // (verde < 90 ms, amarillo < 170, rojo)
    var tick = m && (m.r || m.h) ? '<i class="mx-ok" aria-hidden="true"><svg viewBox="0 0 24 24" width="10" height="10"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></i>' : '';
    var aria = 'Dorsal ' + num + ', ' + role + ': ' + (m ? m.n + (mine ? ' (tú)' : '') + (m.h ? ', anfitrión' : '') + (!m.ok ? ', conectando' : m.r || m.h ? ', listo' : ', no está listo') +
      (ping ? ', ping ' + m.p + ' ms' : '') : 'libre, lo lleva la IA');
    // (tu sitio dice «Tú» en vez de tu nombre; el nombre entero, en el aria y en el title)
    // (L3, móvil: en un sitio estrecho —568×320, 6 contra 6— el nombre va corto, «Javi O.», sin elipsis; el entero, en el aria y el
    //  title. «Conectando» ya no va en el texto: lo dicen la opacidad del sitio, el punto que late en el dorsal y el aria)
    var nm = mine ? '<em>Tú</em>' : !m ? 'IA' : mShortName(m.n) !== m.n ? '<span class="mx-nf">' + esc(m.n) + '</span><span class="mx-ns">' + esc(mShortName(m.n)) + '</span>' : esc(m.n);
    var cn = m && !m.ok ? '<i class="mx-cn" aria-hidden="true"></i>' : '';
    return '<button class="' + cls + '" data-a="chair" data-id="' + c + '"' + (can ? '' : ' disabled') + ' aria-label="' + esc(aria) + '"' + (m ? ' title="' + esc(m.n) + '"' : '') + '><span class="mx-num">' + num + ping + tick + cn + '</span>' +
      '<span class="mx-tx"><b data-ph-ell>' + nm + '</b><small data-ph-ell>' + esc(role) + '</small></span></button>';
  }
  /** «Javi Ortega» → «Javi O.» (nombre y la inicial del último apellido); un nombre de una palabra, tal cual. */
  function mShortName(n) {
    var w = String(n || '').split(' ').filter(Boolean);
    return w.length < 2 ? String(n || '') : w[0] + ' ' + Array.from(w[w.length - 1])[0] + '.';
  }
  /** Móvil: la cabecera de la sala de varios (formato, «cambiar los equipos de lado» del anfitrión y el código que se copia). */
  function mHeadHTML() {
    var E = L.mx, r = E.room, host = E.role === 'host';
    return '<i class="sp-chip ol-hchip">' + FMT_TXT[fmtOf(r)] + '</i>' +
      (host && r.mode !== 'coop' && !L.started ? '<button class="mx-swap" type="button" data-a="swap" aria-label="Cambiar los equipos de lado">' + IC.swap + '</button>' : '') +
      '<button class="ol-code ol-hcode sp-chip" type="button" data-a="copy" aria-label="' + esc('Código ' + r.code.split('').join(' ') + '. Copiar') + '">' + esc(r.code) + IC.copy + '</button>';
  }
  /** Sala de espera de varios: dos columnas de sitios (2 o 6 por lado) con los colores de cada equipo; de pie, abajo. */
  function mRoomHTML(PH) {
    var E = L.mx, r = E.room, host = E.role === 'host', ps = perSide(r), me = mxMine(E), b2 = r.venue === 'beach', vn2 = venueName(r), k2 = b2 ? 'Playa' : 'Pabellón';
    var ko = E.ro.ko, cols = '', teams = r.mode === 'coop' ? [0] : [0, 1];
    teams.forEach(function (t) {
      var chips = '', n = 0;
      for (var i = 0; i < ps; i++) { chips += mChip(E, t * ps + i, me); if (mxAt(E, t * ps + i)) n++; }
      var mine = me && me.c >= 0 && chairOf(r, me.c).t === t;
      cols += '<div class="mx-team" style="--tk:' + hexCol(ko && ko[t], t ? '#ff7a45' : '#2bb3a3') + '"><b class="mx-th">' + (t ? 'Equipo B' : 'Equipo A') + ' <span>' + n + '/' + ps + '</span>' +
        (mine ? ' <i>(el tuyo)</i>' : '') + '</b><div class="mx-grid" data-nav>' + chips + '</div></div>';
    });
    var bench = E.ro.m.filter(function (m) { return m.c < 0; }), benchH = '';
    if (bench.length) benchH = '<div class="mx-bench" data-nav><small>De pie:</small>' + bench.map(function (m) {
      if (host && m.ok && !m.h) return '<button class="mx-bp' + (L.pick === m.u ? ' pick' : '') + '" data-a="pick" data-id="' + esc(m.u) + '" aria-label="' + esc(m.n + ', de pie. Elegir para darle un sitio') + '">' + esc(m.n) + '</button>';
      return '<i class="mx-bp">' + esc(m.n) + (m.ok ? '' : ' (conectando…)') + '</i>';
    }).join('') + '</div>';
    var st = mStatus(E), bad = false;
    // (L3, móvil: el formato, «cambiar de lado» y el código suben a la cabecera; la sede va abajo, con los chips del partido, y el
    //  estado, en la barra entre «Salir» y la principal: los 12 sitios del 6 contra 6 caben sin desplazar en 568×320)
    var info = PH ? '<p class="mx-info"><b>' + esc(k2 + (vn2 && vn2 !== k2 ? ', ' + vn2 : '')) + '</b>' + (host ? '' : '<span>, sala de ' + esc(r.name) + '</span>') + '</p>' : '';
    var h = '<div class="ol-match ol-mx sp-panel ol-scroll ' + (ps === 6 ? 'mx6 ' : '') + (b2 ? 'v-beach' : 'v-hall') + '">' + (PH ? '' :
      '<div class="mt-top" data-nav><span class="sp-crest" aria-hidden="true">' + VEN_IC[b2 ? 'beach' : 'hall'] + '</span><span class="mt-ven"><b data-ph-ell>' + FMT_TXT[fmtOf(r)] + ', ' + k2 +
      (vn2 && vn2 !== k2 ? ', ' + esc(vn2) : '') + '</b>' + (host ? '' : '<small class="mt-who">Sala de ' + esc(r.name) + '</small>') + '</span>' +
      (host && r.mode !== 'coop' && !L.started ? '<button class="mx-swap" type="button" data-a="swap" aria-label="Cambiar los equipos de lado">' + IC.swap + '</button>' : '') +
      '<button class="ol-code sp-chip" type="button" data-a="copy" aria-label="' + esc('Código ' + r.code.split('').join(' ') + '. Copiar') + '">' + esc(r.code) + IC.copy + '</button></div>') +
      '<div class="mx-teams">' + cols + '</div>' + benchH + info +
      '<div class="fx-chips mt-chips">' + chipsHTML(r) + '</div>' +
      // (móvil: el estado va en la barra; en PC, dentro de la hoja como en el 1 contra 1)
      (PH ? '</div>' : '<p class="ol-st mx-st' + (bad ? ' bad' : '') + '" role="status">' + esc(st) + '</p></div>');
    var stD = PH ? '<p class="ol-st mx-st mx-st-dock' + (bad ? ' bad' : '') + '" role="status">' + esc(st) + '</p>' : '';
    var dock = '<div class="ol-bar ol-bar2' + (PH ? ' ol-dock mx-dock' : '') + '" data-nav>';
    if (host && L.pick && !L.started) {
      dock += '<button class="ol-act sp-btn sp-ink sp-dock-l" data-shape="2" data-a="unpick"><span class="sp-t">Cancelar</span></button>' + stD +
        '<button class="ol-act ol-new sp-btn sp-danger" data-shape="1" data-a="kick">' + ic('out') + '<span class="sp-t">Sacar de la sala</span></button>';
    } else {
      dock += '<button class="ol-act ol-out sp-btn sp-danger sp-dock-l" data-shape="1" data-a="leave">' + ic('out') + '<span class="sp-t">Salir</span></button>' + stD +
        (others().length ? '<button class="ol-act ol-ico sp-btn sp-ink sp-sq" data-shape="2" data-a="report" aria-label="Denunciar nombre">' + ic('rep') + '</button>' : '');
      if (host) {
        var cs = mxCanStart(E);
        dock += (PH ? '<button class="ol-act ol-ico sp-btn sp-teal sp-sq" data-shape="2" data-a="share" aria-label="Compartir la sala">' + ic('share') + '</button>' : '') +
          '<button class="ol-act ol-new sp-btn sp-kit" data-shape="0" data-a="start"' + (cs.ok && !L.started ? '' : ' disabled') + '><span class="sp-t">Empezar</span></button>';
      } else {
        var rd = !!(me && me.r), can = !!me && me.c >= 0 && E.status === 'linked' && !L.started;
        dock += '<button class="ol-act ol-new sp-btn ' + (rd ? 'sp-gold' : 'sp-kit') + '" data-shape="0" data-a="ready" aria-pressed="' + rd + '"' + (can ? '' : ' disabled') + '><span class="sp-t">' + (rd ? 'No estoy listo' : 'Listo') + '</span></button>';
      }
    }
    return h + dock + '</div>';
  }
  /** ?olmock: sala de varios de muestra (sin red), para las capturas y tools/mobaudit.js. fmt '2v2' | '6v6', role 'host' | 'guest'. */
  function mDemo(fmt, role) {
    leaveRoom();
    var six = fmt === '6v6', ms = maps('hall'), host = role !== 'guest';
    var r = { id: host ? 'mockMe' : 'mockH', code: 'Q4WX8M', name: host ? myName() : 'Lucía Marín', host: host ? 'mockMe' : 'mockH', venue: 'hall', map: ms[0] || '', bo: 3, pts: 25,
      even: false, state: 'open', age: 0, multi: true, mode: 'vs', cap: six ? 12 : 4, fmt: six ? '6v6' : '2v2', seats: {}, nseat: six ? 10 : 3, free: six ? 1 : 0 };
    var E = Mx({ role: host ? 'host' : 'guest', room: r, mock: true, onChange: mChange, onNote: mNote, onEnd: mEnd, onGo: noop });
    E.status = 'linked';
    var N = ['Lucía Marín', 'Pau Ferrer', 'Sara Llopis', 'Javi Ortega', 'Iker Sanz', 'Marta Gil', 'Nerea Puig', 'Alex Roca', 'Bruno Vidal', 'Carla Soler', 'Dani Mas'];
    var m = [], me = myName();
    if (six) {
      // [sitio, ping, listo, conectado]: casi todos dentro, uno de pie y otro aún conectando
      var S6 = [[0, 95, 1, 1], [2, 40, 1, 1], [3, 66, 1, 1], [6, 120, 1, 1], [7, 58, 1, 1], [9, 182, 0, 1], [10, 0, 0, 0], [11, 77, 1, 1], [-1, 61, 0, 1]];
      m.push(host ? { u: 'mockMe', n: me, c: 1, r: true, h: 1, ok: 1, p: 0 } : { u: 'mockH', n: N[0], c: 1, r: true, h: 1, ok: 1, p: 0 });
      if (!host) m.push({ u: 'mockMe', n: me, c: 4, r: false, h: 0, ok: 1, p: 48 });
      S6.forEach(function (x, k) { m.push({ u: 'mk' + k, n: N[k + 1], c: x[0], r: !!x[2], h: 0, ok: x[3], p: x[1] }); });
    } else {
      m.push(host ? { u: 'mockMe', n: me, c: 0, r: true, h: 1, ok: 1, p: 0 } : { u: 'mockH', n: N[0], c: 0, r: true, h: 1, ok: 1, p: 0 });
      if (!host) m.push({ u: 'mockMe', n: me, c: 3, r: false, h: 0, ok: 1, p: 52 });
      m.push({ u: 'mk1', n: N[1], c: 1, r: true, h: 0, ok: 1, p: 44 }, { u: 'mk2', n: N[2], c: 2, r: true, h: 0, ok: 1, p: 131 });
    }
    E.ro = { v: 1, m: m, ko: null }; mxKits(E);
    L.mx = E; L.room = r; L.role = E.role; L.started = false; L.pick = ''; L.msg = '';
    setView('room');
  }

  /* =====================================================================================================================
   * CARRERA COOPERATIVA: VB.NetLobby.coop (contrato P6 ↔ P7; notes/online-multi-requests.md «P6 → P7»)
   *   coop.host({title, name, look, venue, onReady, onClose}) → true | false (ya hay una sala en marcha). Abre una sala coop (mode
   *     'coop', cap 2, fmt '2v2', no sale en la lista) y enseña una hoja SPLAT (#olCoop) con el código, «Compartir» (enlace
   *     ?coop=CÓDIGO) y «Cancelar».
   *   coop.join({code, name, look, onReady, onClose}) → true | false. Entra por código (la hoja dice «Buscando…» / «Conectando…»).
   *     Con ?coop=CÓDIGO en la dirección, el lobby llama a VB.CareerCoop.onJoinLink(código) si existe; si no, una hoja para unirse.
   *   onReady({link, seat (0 anfitrión, 1 invitado), names: [anfitrión, invitado], looks: [anfitrión, invitado], room: {id, code,
   *     host, mode}}) cuando el enlace WebRTC está abierto y los dos se han saludado. La hoja se cierra.
   *     link = fachada del enlace para pasarla a ctx.actions.startOnline({coop: true, links: [link], …}): mientras la sesión la lee
   *     (poll), el lobby no la lee; su close() (main.js netStop al acabar el partido) NO cierra el enlace de verdad, solo lo devuelve
   *     al lobby (latido y mensajes). Mientras no hay partido, el lobby mantiene el enlace vivo (latido 'lb-ping' cada 1 s; sin
   *     noticias en 9 s = caído) y llama a onClose(why) si se cae: why = 'hostLeft' | 'mateLeft' | 'hostLost' | 'gone' | 'kick' |
   *     'cancel' (Cancelar en la hoja) | 'denied' (reglas sin desplegar) | 'off' | 'nortc' | 'noacc' | 'nocode' | 'full' | …
   *   coop.send(obj) → true | false: mensaje de la app al otro lado, fiable y en orden por el canal 'ctl' (JSON), troceado solo si pasa
   *     de 4000 caracteres (piezas de ≤ 12 KB); vale antes, durante y después del partido.
   *   coop.onMessage(fn) → función para quitarlo: fn(obj) por cada mensaje del otro lado (en el orden en que se mandaron).
   *   coop.close(): sales tú (sin onClose). coop.state() → {on, role, ready, code}.
   * ===================================================================================================================== */
  var CO = null, COH = [], CO_PEND = '';
  function coopIn(E, d) {
    if (!CO || CO.E !== E) return;
    COH.slice().forEach(function (fn) { try { fn(d); } catch (e) { if (window.console) console.error(e); } });
  }
  function coopWhy(why) {
    return {
      denied: 'La Carrera cooperativa aún no está activada en el servidor.', off: 'El online aún no está activado en el servidor. Vuelve a probar en un rato.',
      nortc: 'Este navegador no puede jugar online.', noacc: 'Necesitas una cuenta para jugar en cooperativo.', code: 'El código tiene 6 letras y cifras (sin 0, O, 1, I ni L).',
      nocode: 'No hay ninguna Carrera cooperativa abierta con ese código.', notcoop: 'Ese código es de una sala normal: entra desde Online.', full: 'Esa Carrera ya tiene compañero.',
      gone: 'La sala se ha cerrado.', hostLeft: 'Quien te invitó ha cerrado la sala.', hostLost: 'Se ha perdido la conexión.', noHost: 'Quien te invitó no responde.',
      noconn: 'No se ha podido conectar: vuestras redes no lo permiten. Probad otra vez o desde otra red.', mateLeft: 'Tu compañero ha salido.',
      kick: 'Te han sacado de la sala.', version: errText({ code: 'version' }), auth: errText({ code: 'auth' }), net: errText({ code: 'net' })
    }[why] || 'No ha salido. Prueba otra vez.';
  }
  function coopEl() {
    var d = document.getElementById('olCoop');
    if (!d) {
      d = document.createElement('div'); d.id = 'olCoop'; d.hidden = true;
      d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Carrera cooperativa');
      d.addEventListener('click', coopClick);
      d.addEventListener('keydown', function (e) { if (e.key === 'Escape' || e.key === 'Backspace' && e.target === d) { e.stopPropagation(); e.preventDefault(); coopCancel(); } });
      document.body.appendChild(d);
    }
    return d;
  }
  /** Hoja SPLAT de la coop: o = {title, text, bad, code, ctas: [[acción, texto, color]]} (la última, la principal, abajo a la derecha). */
  function coopSheet(o) {
    ensureCss();
    var d = coopEl(), key = JSON.stringify(o);
    if (d.getAttribute('data-k') === key && !d.hidden) return;
    d.setAttribute('data-k', key);
    d.innerHTML = '<div class="oc-card sp-panel"><h3>' + esc(o.title || 'Carrera cooperativa') + '</h3>' +
      (o.text ? '<p class="oc-t' + (o.bad ? ' bad' : '') + '" role="status">' + esc(o.text) + '</p>' : '') +
      (o.code ? '<button class="oc-code sp-chip" type="button" data-oc="copy" aria-label="' + esc('Código ' + o.code.split('').join(' ') + '. Copiar') + '">' + esc(o.code) + IC.copy + '</button>' : '') +
      '<div class="oc-bar">' + (o.ctas || []).map(function (x, i) { return '<button class="sp-btn sp-md ' + x[2] + '" data-shape="' + i + '" data-oc="' + x[0] + '"><span class="sp-t">' + esc(x[1]) + '</span></button>'; }).join('') + '</div></div>';
    d.hidden = false; coopUnder(true);
    if (VB.Splat && VB.Splat.decorate) { try { VB.Splat.decorate(d); } catch (e) { } }
    setTimeout(function () { var bs = d.querySelectorAll('[data-oc]'), b = bs[bs.length - 1]; if (b && !d.hidden) { try { b.focus(); } catch (e) { } } }, 30);
  }
  function coopHide() { coopUnder(false); var d = document.getElementById('olCoop'); if (d) { d.hidden = true; d.innerHTML = ''; d.removeAttribute('data-k'); } }
  /** (L3) La hoja es modal (aria-modal): lo de debajo queda inert y sin toques (.oc-under) mientras se ve. Antes los botones del menú
   *  seguían siendo objetivos debajo de la hoja (6 solapes en tools/mobaudit.js) y el foco con Tab podía irse detrás. No se tocan
   *  los avisos (#spToasts, aria-live) ni lo que ya estaba oculto o inert. */
  var ocUnder = [];
  function coopUnder(on) {
    ocUnder.forEach(function (e) { e.removeAttribute('inert'); e.classList.remove('oc-under'); }); ocUnder = [];
    if (!on || typeof document === 'undefined' || !document.body) return;
    var ch = document.body.children || [];
    for (var i = 0; i < ch.length; i++) {
      var e = ch[i];
      if (!e || e.id === 'olCoop' || /^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(e.tagName) || e.hidden || e.hasAttribute('inert') || e.hasAttribute('aria-live') || e.id === 'spToasts' || (e.querySelector && e.querySelector('#spToasts'))) continue;
      e.setAttribute('inert', ''); e.classList.add('oc-under'); ocUnder.push(e);
    }
  }
  function coopClick(ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('[data-oc]') : null; if (!b) return;
    var a = b.getAttribute('data-oc'); sound('click');
    if (a === 'cancel') coopCancel();
    else if (a === 'copy') { var c = CO && CO.E && CO.E.room.code; if (c) { try { navigator.clipboard.writeText(c).then(noop, noop); } catch (e) { } if (VB.Splat && VB.Splat.toast) VB.Splat.toast('Código copiado: <b>' + esc(c) + '</b>', { key: 'olc' }); } }
    else if (a === 'share') coopShare();
    else if (a === 'join') coopJoinGo();
    else if (a === 'ok') coopHide();
    else if (a === 'okClose') { coopClose(); }
    else if (a === 'bkCancel') bkCancel();   // (lane A: «Volviendo a la partida…» → Cancelar)
  }
  function coopShare() {
    var c = CO && CO.E && CO.E.room.code; if (!c) return;
    var url = shareSite() + '?coop=' + c, txt = 'Juega conmigo la Carrera de Take the Court en cooperativo: código ' + c;
    var copied = function () { if (VB.Splat && VB.Splat.toast) VB.Splat.toast('Enlace copiado. Código <b>' + esc(c) + '</b>', { key: 'olc' }); };
    var copy = function () { try { navigator.clipboard.writeText(txt + ' ' + url).then(copied, copied); } catch (e) { copied(); } };
    if (navigator.share) { try { navigator.share({ title: 'Take the Court', text: txt, url: url }).catch(function (e) { if (!e || e.name !== 'AbortError') copy(); }); return; } catch (e) { } }
    copy();
  }
  function coopRender(E) {
    var me = CO; if (!me || me.E !== E || me.ready) return;
    var t = me.cfg.title || 'Carrera cooperativa', p = null;
    for (var u in E.peers) p = E.peers[u];
    if (E.role === 'host') coopSheet({ title: t, text: p ? 'Conectando con ' + p.n + '…' : 'Pasa el código o el enlace a quien vaya a jugar contigo. Esperando…', code: E.room.code,
      ctas: [['cancel', 'Cancelar', 'sp-danger'], ['share', 'Compartir', 'sp-kit']] });
    else coopSheet({ title: t, text: 'Conectando con la Carrera de ' + (E.room.name || '…') + '…', ctas: [['cancel', 'Cancelar', 'sp-danger']] });
  }
  function coopReady(E, u) {
    var me = CO; if (!me || me.E !== E || me.ready) return;
    var host = E.role === 'host', o = host ? mxMem(E, u) : null;
    var names = host ? [E.nm, (o && o.n) || 'Invitado'] : [(E.hi.host && E.hi.host.n) || E.room.name || 'Anfitrión', E.nm];
    var looks = host ? [mxLook(E), (E.hi[u] && E.hi[u].look) || null] : [(E.hi.host && E.hi.host.look) || null, mxLook(E)];
    me.ready = true; me.link = mkFacade(E); E.coopOn = true;
    // (la sala ya no admite a nadie más; las reglas ya paran en cap-1). Se deja de sondear la sala: solo queda el latido (uno por minuto,
    //  PLAY_BEAT_MS, sin releer), que la mantiene viva para renegociar el enlace en pleno partido (una sala de más de 5 min sin latido
    //  la puede borrar cualquiera)
    if (host) mxStop(E, 'poll');
    if (host && !E.mock) { E.beatAt = Date.now(); api().beat({ state: 'full' }, { lite: true }).catch(noop); }
    coopHide();
    if (me.cfg.onReady) { try { me.cfg.onReady({ link: me.link, seat: host ? 0 : 1, names: names, looks: looks, room: { id: E.room.id, code: E.room.code, host: E.room.host, mode: 'coop' } }); } catch (e) { if (window.console) console.error(e); } }
  }
  function coopEnded(why, E) {
    var me = CO; if (!me || (E && me.E !== E)) return;
    CO = null;
    if (!me.ready && why !== 'cancel') coopSheet({ title: me.cfg.title || 'Carrera cooperativa', text: coopWhy(why), bad: true, ctas: [['ok', 'Entendido', 'sp-gold']] });
    else coopHide();
    if (me.cfg.onClose) { try { me.cfg.onClose(why); } catch (e) { if (window.console) console.error(e); } }
  }
  function coopBusy(cfg) {
    var bad = CO || L.mx || L.room || BK ? 'busy' : noRtc() ? 'nortc' : !signedIn() ? 'noacc' : '';
    if (!bad) return false;
    if (bad !== 'busy') coopSheet({ title: cfg.title || 'Carrera cooperativa', text: coopWhy(bad), bad: true, ctas: [['ok', 'Entendido', 'sp-gold']] });
    if (cfg.onClose) setTimeout(function () { try { cfg.onClose(bad); } catch (e) { } }, 0);
    return true;
  }
  function coopHost(cfg) {
    cfg = cfg || {};
    if (coopBusy(cfg)) return false;
    var me = CO = { role: 'host', cfg: cfg, ready: false, E: null, link: null };
    coopSheet({ title: cfg.title || 'Carrera cooperativa', text: 'Abriendo la sala…', ctas: [['cancel', 'Cancelar', 'sp-danger']] });
    api().open({ name: ownName(cfg.name), mode: 'coop', cap: 2, fmt: '2v2', venue: cfg.venue === 'hall' ? 'hall' : 'beach', map: '', bo: 1, pts: 21, even: false }).then(function (r) {
      if (CO !== me) { api().close(); return; }
      if (!r || !r.multi) throw { code: 'denied' };
      me.E = Mx({ role: 'host', room: r, coop: true, name: cfg.name, look: cfg.look, onChange: coopRender, onEnd: coopEnded });
      mxHostInit(me.E); coopRender(me.E);
    }).catch(function (e) { if (CO === me) coopEnded((e && e.code) || 'error'); });
    return true;
  }
  function coopJoin(cfg) {
    cfg = cfg || {};
    if (coopBusy(cfg)) return false;
    var code = NR().normCode(cfg.code), me = CO = { role: 'guest', cfg: cfg, ready: false, E: null, link: null };
    if (!NR().codeOk(code)) { coopEnded('code'); return false; }
    coopSheet({ title: cfg.title || 'Carrera cooperativa', text: 'Buscando la sala ' + code + '…', ctas: [['cancel', 'Cancelar', 'sp-danger']] });
    api().byCode(code).then(function (r) {
      if (CO !== me) return null;
      if (!r) throw { code: 'nocode' };
      if (r.mode !== 'coop') throw { code: 'notcoop' };
      return api().join(r.id, ownName(cfg.name)).then(function (r2) {
        if (CO !== me) { api().leave(r2.id); return; }
        me.E = Mx({ role: 'guest', room: r2, coop: true, name: cfg.name, look: cfg.look, onChange: coopRender, onEnd: coopEnded, onGo: noop });
        mxGuestInit(me.E); coopRender(me.E);
      });
    }).catch(function (e) { if (CO === me) coopEnded((e && e.code) || 'error'); });
    return true;
  }
  function coopCancel() { if (BK && !BK.go) { bkCancel(); return; } var me = CO; if (!me) { coopHide(); return; } coopClose(); if (me.cfg.onClose) { try { me.cfg.onClose('cancel'); } catch (e) { } } }
  function coopClose() { var me = CO; CO = null; coopHide(); if (me && me.E) mxLeave(me.E); }
  function coopSend(obj) {
    var me = CO; if (!me || !me.E || !me.ready || me.E.closed) return false;
    var k = me.link && me.link._real(); if (!k) return false;
    mxSend(k, { k: 'cx', d: obj }); return true;
  }
  /** Fachada del enlace de la coop para la sesión del partido (ver el contrato arriba). */
  function mkFacade(E) {
    var cur = function () { if (E.role !== 'host') return E.hostLink; for (var u in E.peers) return E.peers[u].link; return null; };
    var F = { onclose: null };
    Object.defineProperty(F, 'state', { get: function () { var k = cur(); return E.closed || !k ? 'closed' : k.state; } });
    Object.defineProperty(F, 'opens', { get: function () { var k = cur(); return k ? k.opens : 0; } });
    F.send = function (ch, d) { var k = cur(); if (k && !E.closed) k.send(ch, d); };
    F.poll = function (now) {
      E.attached = true;
      var k = cur(); if (!k || E.closed) return [];
      var ms = k.poll(now), out = [], t = Date.now(), u = E.role === 'host' ? Object.keys(E.peers)[0] : E.room.host;
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.ch === 'ctl' && mxLobbyMsg(m.data)) { var c = mxUnchunk(E, mxParse(m.data)); if (c) mxMsg(E, u, c, t); if (E.closed) return out; }
        else out.push(m);
      }
      return out;
    };
    F.info = function () { var k = cur(); return k && k.info ? k.info() : { type: '', rtt: 0 }; };
    // (main.js netStop al acabar el partido: el enlace vuelve al lobby, que retoma el latido; el de verdad lo cierra coop.close())
    F.close = function () { E.attached = false; var t = Date.now(); E.heard.host = t; for (var u in E.peers) E.heard[u] = t; };
    F._real = cur;
    return F;
  }
  /** ?coop=CÓDIGO o un código de coop en «Código»: la Carrera (P7) si está; si no, una hoja para unirse. */
  function coopLink(code) {
    code = NR().normCode(code);
    var CC = VB.CareerCoop;
    if (CC && typeof CC.onJoinLink === 'function') { try { CC.onJoinLink(code); } catch (e) { if (window.console) console.error(e); } return; }
    CO_PEND = code;
    coopSheet({ title: 'Carrera cooperativa', text: 'Te han invitado a jugar una Carrera en cooperativo (código ' + code + ').', ctas: [['ok', 'Ahora no', 'sp-ink'], ['join', 'Entrar', 'sp-kit']] });
  }
  function coopJoinGo() {
    var code = CO_PEND; CO_PEND = '';
    coopJoin({ code: code, name: myName(), look: myLook(), onReady: function (i) {
      coopSheet({ title: 'Carrera cooperativa', text: 'Conectado con ' + i.names[0] + '. Esta versión del juego aún no puede jugar la Carrera en cooperativo.', ctas: [['okClose', 'Salir', 'sp-gold']] });
    } });
  }
  if (Q.coop && VB.NetRoom) {
    var ctries = 0, cwait = setInterval(function () {
      var C = ctx(), U = VB.UI;
      if (++ctries > 240) { clearInterval(cwait); return; }
      if (!C || C.state !== 'menu' || !U || !U.menuIdle || !U.menuIdle()) return;
      clearInterval(cwait); coopLink(String(Q.coop));
    }, 500);
  }

  /* ---------------- API para ui.js ---------------- */
  function open(host) {
    ensureCss();
    if (VB.Update) VB.Update.check(true);   // (entrar en el Online: con una versión anterior no se puede jugar con los demás)
    if (!L.host) {
      L.host = host;
      host.addEventListener('click', onClick);
      // (barra de acciones: el botón que recibe el foco —ratón, Tab— pasa a ser la parada de ↑↓ de la barra)
      host.addEventListener('focusin', function (e) {
        var b = e.target, par = b && b.parentNode;
        if (!par || !par.classList || !par.classList.contains('ol-bar') || par.classList.contains('ol-bar2') || !b.hasAttribute('data-skip')) return;
        Array.prototype.forEach.call(par.querySelectorAll('button'), function (x) { if (x !== b) x.setAttribute('data-skip', ''); });
        b.removeAttribute('data-skip'); L.barKey = b.getAttribute('data-a');
      });
      if (VB.Account && VB.Account.onChange) VB.Account.onChange(function () {
        var k = accKey(), was = L.accKey; L.accKey = k;
        if (k === was || !L.on || L.room || L.view === 'nortc') return;   // (las sincronizaciones también avisan: no echan de «Crear sala» ni cierran «Tu nombre»)
        rooms = null; L.msg = '';
        if (k && !ls(HELPK)) { L.helpFrom = 'new'; setView('help'); return; }
        setView(k ? 'list' : 'noacc'); if (k) refreshList(true);
      });
    }
    if (!host.querySelector('.ol-body')) { var d = document.createElement('div'); d.className = 'ol-body'; host.appendChild(d); }
    // (móvil: hueco a la derecha del título para tu nombre o el paso; en PC queda vacío y oculto)
    var hd = host.querySelector('.mp-head'); if (hd && !hd.querySelector('.ol-hr')) { var hr0 = document.createElement('div'); hr0.className = 'ol-hr'; hd.appendChild(hr0); }
    L.on = true; lastH = ''; L.accKey = accKey();
    if (L.started) return;
    if (noRtc()) { L.msg = ''; setView('nortc'); return; }
    if (!signedIn()) { setView('noacc'); return; }
    if (L.view !== 'room' || !L.room) {
      L.msg = L.msg || '';
      if (!ls(HELPK) && !L.pendingCode) { L.helpFrom = 'new'; setView('help'); }   // (la primera vez, «Cómo funciona» antes de la lista)
      else { setView('list'); refreshList(true); }
    }
    else render(true);
    if (L.pendingCode) { var pc = L.pendingCode; L.pendingCode = ''; joinCode(pc); }
  }
  function leave() {
    if (!L.on) return;
    L.on = false;
    if (L.toastApi) { L.toastApi.close(); L.toastApi = null; L.toasted = ''; }
    if (!L.started) { leaveRoom(); stopAll(); L.view = 'list'; L.msg = ''; }
  }
  /** Esc / B dentro del lobby: primero se cierra lo abierto (edición, crear sala, la sala) y solo luego se sale de la página. */
  function back() {
    if (!L.on) return false;
    if (L.edit) { var k = L.edit; L.edit = ''; L.osk = null; render(true); focusA(k); return true; }
    if (L.view === 'create') { L.msg = ''; setView('list'); refreshList(false); focusA('new'); return true; }
    if (L.view === 'help') { ls(HELPK, '1'); setView('list'); refreshList(false); focusA(L.helpFrom || 'help'); L.helpFrom = ''; return true; }
    if (L.view === 'room' && L.mx && L.pick && !L.started) { L.pick = ''; render(); return true; }   // (anfitrión con alguien elegido: primero se suelta)
    if (L.view === 'room' && !L.started) { leaveRoom(); setView('list'); refreshList(true); focusA('new'); return true; }
    return false;
  }
  function side(el, d) {
    var k = el && el.getAttribute && el.getAttribute('data-ol'); if (k) { step(k, d); return true; }
    if (el && el.parentNode && el.parentNode.classList && (el.parentNode.classList.contains('ol-bar') || el.parentNode.classList.contains('osk-row'))) return rowStep(el, d);
    return false;
  }

  // Cerrar o recargar la pestaña: la sala (anfitrión) o el hueco (invitado) se liberan al momento, sin esperar a que caduquen.
  // (pagehide también salta al ir a otra página; 'persisted' = la página queda en la caché del navegador y puede volver: entonces
  // también se suelta, y al volver se está en la lista.)
  document.addEventListener('vb:ph', function () { if (L.on) render(true); });   // (girar / cambiar de tamaño: otra disposición)
  document.addEventListener('visibilitychange', function () { try { mxVis(L.mx); if (CO && CO.E && CO.E !== L.mx) mxVis(CO.E); mxBackVis(); } catch (e) { } });
  window.addEventListener('pagehide', function () {
    // (lane A) online de varios y Carrera coop: el INVITADO en pleno partido apunta la vuelta y NO suelta su plaza (ni dice adiós: para
    // los demás es una caída y la IA lleva su jugador mientras vuelve); el ANFITRIÓN avisa de que se va (sin vuelta: no cuenta)
    var mxSaved = false; try { mxSaved = mxBackSave(); mxHostLeaving(); } catch (e) { }
    if (BK) { if (!mxSaved && BK.E) { try { mxBye(BK.E); } catch (e) { } } return; }
    if (CO && CO.E && !(mxSaved && CO.E.role === 'guest')) { try { mxBye(CO.E); } catch (e) { } }   // (Carrera cooperativa: la sala o la plaza, fuera)
    if (L.mx) { if (!(mxSaved && L.mx.role === 'guest')) { try { mxBye(L.mx); } catch (e) { } } if (!L.started) { L.mx = null; L.room = null; L.role = ''; L.view = 'list'; } return; }
    if (!rooms || !L.room || !L.role) return;
    // (vuelta al partido tras recargar: ver «VUELTA AL PARTIDO» abajo. Si se ha apuntado la vuelta, el invitado NO suelta su
    // hueco: con la sala aún en 'full' el PATCH de bye entraría y la sala volvería a la lista sin él. Si no vuelve, el anfitrión
    // lo ve como una desconexión normal.)
    if (!backSave()) { try { rooms.bye(L.role, L.room.id); } catch (e) { } }
    if (L.started) return;   // (en pleno partido la sesión sigue a lo suyo: para el rival es una desconexión normal)
    abortConn(); stopAll(); L.room = null; L.role = ''; L.rival = ''; L.started = false; L.view = 'list';
  });

  /* ---------------- VUELTA AL PARTIDO TRAS RECARGAR (net: robustez; notes/net.md «Robustez y privacidad») ----------------
   * El INVITADO (aquí) y, desde la fase 6, también el ANFITRIÓN (ver hostBackSave / rejoinHost más abajo).
   * pagehide en pleno partido → sessionStorage BACK = {id sala, uid, gen, ep (época), rival, look, t}. Al cargar (misma pestaña,
   * misma cuenta, < BACK_MS): sala aún en 'full'/'play' con este uid de invitado → enlace nuevo, se contesta a la siguiente oferta
   * del anfitrión (su relink manda una con gen+1 cada 10 s durante ~60 s) y una sesión nueva sin opciones: el saludo trae las del
   * anfitrión y su 'ready' provoca el resync con la foto (Sim.serialize). Cabe en las reglas ya desplegadas (respuesta del invitado
   * con la sala en 'full'/'play'). La marca de partido (NetRec.resume) se hereda: si no se llega a jugar, cuenta como abandono. */
  var BACK = 'make-the-cut.online.back', BACK_MS = 50000;
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { } return null; }
  function backSave() {
    if (L.mx) return false;   // (online de varios: su propia vuelta, mxBackSave más abajo)
    if (L.role === 'host') return hostBackSave();   // (fase 6: también el anfitrión)
    try {
      var C = ctx(), n = C && C.net, st = n && n.sess && n.sess.status;
      if (!L.started || L.role !== 'guest' || !n || n.slot !== 1 || !(st === 'playing' || st === 'waiting' || st === 'connecting' || st === 'starting')) return;
      ss(BACK, JSON.stringify({ id: L.room.id, uid: api().uid() || '', gen: L.gen | 0, ep: n.epoch | 0, rival: L.rival || n.rival || '', look: n.look && n.look.theirs || null,
        model: n.model || roomModel(L.room), t: Date.now() }));
      return !!ss(BACK);   // (sessionStorage puede fallar: entonces se suelta el hueco como siempre)
    } catch (e) { }
    return false;
  }
  function backTry() {
    var b = null; try { b = JSON.parse(ss(BACK) || 'null'); } catch (e) { b = null; }
    ss(BACK, null);   // (un solo intento)
    if (!b || typeof b.id !== 'string' || !b.uid || noRtc()) return;
    if (b.multi) { mxBackTry(b); return; }   // (lane A: online de varios y Carrera coop)
    var late = !(Date.now() - (+b.t || 0) < BACK_MS);
    if (late && b.role !== 'host') return;   // (fase 6: el anfitrión fuera de plazo aún borra su sala, abajo)
    var tries = 0, wait = setInterval(function () {
      var C = ctx(), U = VB.UI;
      if (++tries > 40 || (!late && Date.now() - b.t > BACK_MS)) { clearInterval(wait); return; }
      if (!signedIn() || !C || C.state !== 'menu' || !C.actions || !C.actions.startOnline || !U || !U.menuIdle || !U.menuIdle() || L.room) return;
      clearInterval(wait);
      if (b.role === 'host') { hostBackTry(b, late); return; }
      api().get(b.id).then(function (r) {
        if (!r || api().uid() !== b.uid || r.guest !== b.uid || (r.state !== 'full' && r.state !== 'play') || r.age > NR().LIVE_MS || L.room) return;
        rejoin(r, b);
      }, function () { });
    }, 500);
  }
  /** Online V2: conexión del partido al volver (la apuntada en BACK; si no, la de la sala). */
  function backModel(r, b) { return b && (b.model === 'fluida' || b.model === 'precisa') ? b.model : roomModel(r); }
  function rejoin(r, b) {
    var C = ctx();
    try { if (VB.NetRec && VB.NetRec.resume) VB.NetRec.resume(); } catch (e) { }
    L.role = 'guest'; L.room = r; L.rival = theirName(b.rival, r.host) || theirName(r.name, r.host) || 'Rival'; L.gen = b.gen | 0; L.started = true; L.status = 'play';
    var link = newLink();
    link.onclose = function () { matchClosed(link); };
    var ok = C.actions.startOnline({ slot: 1, link: link, opts: null, name: myName(), rivalName: L.rival, look: { mine: myLook(), theirs: saneLook(b.look) }, model: backModel(r, b) });
    if (!ok) { matchClosed(link); return; }
    // revancha n.º k: la sesión nueva tiene que hablar en la época del anfitrión
    var ep = Math.max(0, Math.min(1e6, b.ep | 0));
    if (ep && C.net && C.net.sess) { C.net.epoch = ep; C.net.sess.epoch = ep; }
    if (C.net && C.net.sess) C.net.sess.back = true;   // (fase 6: aviso «Volviendo al partido…» mientras se conecta)
    guestListen(L.gen);
  }
  /* Fase 6 (notes/net.md «Fase 6»): vuelta del ANFITRIÓN. Su pagehide en pleno partido no borra la sala y apunta la vuelta
   * ({role 'host', id, uid, gen, ep, rival, look, guest, t}). Al volver en plazo: retoma su sala (rooms.resume: latido otra vez),
   * sesión nueva de hueco 0 SIN opciones (adopta la partida del invitado, ver js/net.js «VUELTA DEL ANFITRIÓN») y relink(): oferta
   * con gen+1 al mismo invitado cada 10 s; el invitado, que estaba en «Esperando a…», la ve (guestListen) y contesta. Fuera de
   * plazo (o la sala ya no es la de ese partido) borra su sala: el invitado se queda en «no cuenta» a los 60 s, como antes. */
  function hostBackSave() {
    try {
      var C = ctx(), n = C && C.net, s = n && n.sess, st = s && s.status;
      if (!L.started || !n || n.slot !== 0 || !L.room || !L.room.guest || !(st === 'playing' || st === 'waiting') || s.goneFlag) return false;
      ss(BACK, JSON.stringify({ role: 'host', id: L.room.id, uid: api().uid() || '', gen: L.gen | 0, ep: n.epoch | 0, rival: L.rival || n.rival || '',
        look: n.look && n.look.theirs || null, guest: L.room.guest, model: n.model || roomModel(L.room), t: Date.now() }));
      return !!ss(BACK);   // (si sessionStorage falla, la sala se borra como siempre)
    } catch (e) { }
    return false;
  }
  function hostBackTry(b, late) {
    api().resume().then(function (r) {
      if (!r || api().uid() !== b.uid || r.id !== b.id || L.room) return;
      if (late || Date.now() - b.t > BACK_MS || r.guest !== b.guest || (r.state !== 'full' && r.state !== 'play') || r.age > NR().LIVE_MS) { api().close(); return; }
      rejoinHost(r, b);
    }, function () { });
  }
  function rejoinHost(r, b) {
    var C = ctx();
    try { if (VB.NetRec && VB.NetRec.resume) VB.NetRec.resume(); } catch (e) { }
    L.role = 'host'; L.room = r; L.rival = theirName(b.rival, r.guest) || theirName(r.gname, r.guest) || 'Rival'; L.gen = Math.max(L.gen, b.gen | 0); L.started = true; L.status = 'play';
    every('beat', NR().BEAT_MS, hostBeat); hostBeat();
    var link = newLink();
    link.onclose = function () { matchClosed(link); };
    var ok = C.actions.startOnline({ slot: 0, link: link, opts: null, name: myName(), rivalName: L.rival, look: { mine: myLook(), theirs: saneLook(b.look) }, model: backModel(r, b) });
    if (!ok) { matchClosed(link); return; }
    var ep = Math.max(0, Math.min(1e6, b.ep | 0)), n = C.net;
    if (n && n.sess) { if (ep) { n.epoch = ep; n.sess.epoch = ep; } n.sess.back = true; }
    // la revancha la siembra el anfitrión con net.base (sus opciones): se copian de la partida adoptada en cuanto llega
    var bt = setInterval(function () {
      var m = ctx() && ctx().net;
      if (!m || m !== n || !m.sess || m.sess.status === 'ended') { clearInterval(bt); return; }
      if (m.sess.opts && !m.sess.adopt) { if (!m.base) { var o = {}; for (var k in m.sess.opts) o[k] = m.sess.opts[k]; m.base = o; } clearInterval(bt); }
    }, 500);
    relink();
  }

  /* ---------------- VUELTA TRAS RECARGAR EN EL ONLINE DE VARIOS (lane A, 22-nov-2026) ----------------
   * 2 contra 2 (Precisa-N), 6 contra 6 (modelo anfitrión) y Carrera cooperativa. El INVITADO que recarga, o al que el móvil le mata la
   * pestaña en segundo plano, vuelve solo a SU plaza:
   *  - Marca BACK (sessionStorage, la misma clave que el 1 contra 1, con multi: 1) = {id sala, uid, gen, plaza, humans (equipo, idx,
   *    puesto, nombre y look de cada plaza), modelo, formato, coop, cc (Carrera coop), época, lo anunciado, nombre de quien creó la sala,
   *    t}. Se apunta en el pagehide y TAMBIÉN al ocultarse la página (visibilitychange: el móvil puede matarla sin pagehide), y mientras
   *    sigue oculta se reapunta cada ~3 s (mxBackAlive: t = la última vez que estaba viva); al volver a verse se borra. Nada de SDP
   *    ni direcciones de red. Su plaza no se suelta ni se dice adiós: los demás lo viven como una caída (la IA lleva su jugador) y en
   *    'play' las reglas tampoco dejan levantarse.
   *  - Al cargar (backTry, un solo intento): con la marca de menos de MX_BACK_MS (55 s; 120 s en el modelo anfitrión, que readmite
   *    incluso tras darle por ido), la sala aún con su plaza y viva → hoja «Volviendo a la partida…» con «Cancelar» (la #olCoop de la
   *    coop) y un motor de invitado (Mx) ya «empezado» que escucha la siguiente oferta del anfitrión en sig/o_<uid> (gen mayor que la
   *    apuntada: su relink reofrece a los 0,6 s, cada 10 s el primer minuto y luego cada 20 s, mientras aún se pueda volver: mxRelinkHost).
   *    Con el enlace ABIERTO (no antes: las sesiones dan 'noShow' a los 20 s sin oír a nadie) empieza una sesión nueva sin opciones, como en mGuestGo: el saludo trae las del anfitrión. Precisa-N
   *    (SessionN): saludo + ready → el anfitrión le pasa a la IA y le manda el resync con la foto. Modelo anfitrión (nethost): antes del
   *    saludo, el adiós de la sesión vieja ({k:'bye', why:'reload'}: era verdad, esa sesión ya no existe) y el saludo lo readmite (foto
   *    tele, 'go', 'back' a los demás). HUD «Volviendo a la partida…» con «Salir» hasta que llega la foto.
   *  - Sin enlace en MX_BACK_WAIT (70 s), o la sala desaparece (quien la creó recargó o cerró: «… ha cerrado la sala: el partido no
   *    cuenta», y la marca del récord se cierra como «no cuenta»), una hoja lo dice. «Cancelar» = dejar el partido (la marca del récord
   *    queda y a los 90 s cuenta como abandono, como en el 1 contra 1: recargar no sale gratis).
   *  - Carrera coop: vuelve al PARTIDO (enlace directo, net.coopCareer: sin revancha ni récord). Su Carrera en memoria no vuelve: al
   *    salir de la hoja final, el adiós ('lb-bye') cierra la coop en el anfitrión, que ya acreditó a p2 en su guardado.
   * El ANFITRIÓN no vuelve en el de varios (su partida es la de verdad y nadie la tiene entera): al irse avisa ({t:'hostLeft'} por la
   * sesión) y los invitados acaban en el acto con 'hostGone' («X se ha ido: el partido no cuenta»). Si el aviso no llega, el invitado con
   * el enlace caído mira la sala cada 5 s (mxHostChk): sin sala, lo mismo. Con la pestaña oculta un rato (móvil), sus invitados esperan
   * con «X ha salido un momento de la app…» (main.js, {t:'hostAway'}) hasta los 60 s de siempre. */
  var MX_BACK_MS = 55000, MX_BACK_HOST_MS = 120000, MX_BACK_WAIT = 70000, HOST_CHK_MS = 5000;
  var BK = null;   // {b (la marca), E (motor de la vuelta), go (ya hay sesión), t0}
  function netEnded() { var C = ctx(), r = C && C.net && C.net.r; return !!(r && r.status === 'ended'); }
  function netLive() { var C = ctx(), s = C && C.net && C.net.sess; return !!(s && s.status !== 'ended'); }
  /** Motor del partido de varios en el que estás (vuelta, sala de varios empezada o coop). */
  function mxBackEngine() {
    if (BK && BK.E && !BK.E.closed) return BK.E;
    if (L.mx && L.mx.started && !L.mx.closed) return L.mx;
    if (CO && CO.E && !CO.E.closed) return CO.E;
    return null;
  }
  /** Invitado en pleno partido de varios: apunta la vuelta. true = apuntada (entonces no se suelta la plaza). */
  function mxBackSave() {
    try {
      if (BK && !BK.go) { ss(BACK, JSON.stringify(BK.b)); return !!ss(BACK); }   // (recarga mientras volvía: la misma marca, con su hora)
      var E = mxBackEngine(), C = ctx(), n = C && C.net, s = n && n.sess, st = s && s.status;
      if (!E || E.role !== 'guest' || E.mock || !n || !n.multi || !(n.seat > 0) || !Array.isArray(n.humans) || n.seat >= n.humans.length) return false;
      if (!(st === 'playing' || st === 'waiting' || st === 'starting' || st === 'connecting') || s.goneFlag) return false;
      var H = n.humans.map(function (h) { return { team: h.team, idx: h.idx, role: h.role || '', name: h.name || '', look: h.look || null }; });
      ss(BACK, JSON.stringify({ multi: 1, id: E.room.id, uid: api().uid() || '', gen: E.gen | 0, seat: n.seat, humans: H, model: n.model === 'host' ? 'host' : 'precisa',
        fmt: E.room.fmt === '6v6' ? '6v6' : '2v2', coop: E.room.mode === 'coop' ? 1 : 0, cc: n.coopCareer ? 1 : 0, ep: n.epoch | 0, expect: n.expect || null,
        host: theirName(E.room.name, E.room.host) || '', t: Date.now() }));
      return !!ss(BACK);   // (sessionStorage puede fallar: entonces se sale como antes)
    } catch (e) { }
    return false;
  }
  /** Página oculta en pleno partido de varios (invitado): por si el móvil la mata sin pagehide, la vuelta queda apuntada; al volver a
   *  verse, fuera (la sesión siguió viva). */
  function mxBackVis() {
    var E = mxBackEngine(); if (!E || E.role !== 'guest') return;
    if (docHidden()) { mxBackSave(); return; }
    var b = null; try { b = JSON.parse(ss(BACK) || 'null'); } catch (e) { b = null; }
    if (b && b.multi && !(BK && !BK.go)) ss(BACK, null);
  }
  /** Página oculta en pleno partido de varios (invitado), cada ~3 s desde el pulso de main.js (netBgTick, un Worker que no se frena en
   *  segundo plano): la marca BACK se vuelve a apuntar con la hora de ahora. (revisión: antes quedaba con la hora en que se ocultó; si el
   *  móvil la mantenía viva más de MX_BACK_MS —55 s— y la descartaba después, al restaurarla la marca ya estaba caducada y no volvía.) */
  function mxBackAlive() {
    try { if (!docHidden() || (BK && !BK.go)) return; var E = mxBackEngine(); if (E && E.role === 'guest') mxBackSave(); } catch (e) { }
  }
  /** Anfitrión de varios que se va en pleno partido (pagehide): sus invitados acaban ya ('hostGone', no cuenta) en vez de esperar 60 s. */
  function mxHostLeaving() {
    var E = L.mx && L.mx.role === 'host' && L.mx.started ? L.mx : CO && CO.E && CO.E.role === 'host' && CO.E.attached ? CO.E : null;
    var C = ctx(), n = C && C.net, s = n && n.sess;
    if (!E || E.mock || !n || !n.multi || n.seat !== 0 || !s || !s.sendApp || s.status === 'ended' || s.status === 'over') return;
    try { s.sendApp({ t: 'hostLeft' }); } catch (e) { }
  }
  /** Invitado con el enlace caído en pleno partido: si la sala ya no existe, quien la creó se ha ido (recargó o cerró) y no vuelve. */
  function mxHostChk(E) {
    if (E.mock || (E.back && !E.backGo)) return;
    mxEvery(E, 'hostChk', HOST_CHK_MS, function () {
      if (E.closed || (E.hostLink && E.hostLink.state === 'open') || !netLive()) { mxStop(E, 'hostChk'); return; }
      api().get(E.room.id).then(function (r) {
        if (r || E.closed || (E.hostLink && E.hostLink.state === 'open') || !netLive()) return;
        mxStop(E, 'hostChk');
        var C = ctx(); if (C && C.actions && C.actions.netHostLeft) C.actions.netHostLeft();
      }, noop);
    });
  }
  /** Telemetría (lane A): un enlace que no llega a abrirse ANTES del partido deja un documento pequeño (VB.NetLog.prefail). */
  function mxPrefail(E, link, why, ms) {
    if (!E || E.mock || E.pf || !VB.NetLog || !VB.NetLog.prefail || (link && link.opens) || netLive()) return;
    E.pf = true;   // (uno por sala)
    var r = E.room || {};
    try {
      VB.NetLog.prefail({ role: E.role, fmt: E.coop ? 'coop' : fmtOf(r), cap: r.cap | 0, mode: r.mode || '', why: why, ms: ms, phase: E.back ? 'vuelta' : 'sala',
        diag: VB.NetLog.linkDiag ? VB.NetLog.linkDiag(link) : null, relay: !!(VB.NetRtc && VB.NetRtc.relayOn && VB.NetRtc.relayOn()) });
    } catch (e) { }
  }
  /** Hoja «Volviendo a la partida…» (la de la coop: SPLAT, modal, móvil primero). */
  function bkSheet(text) { coopSheet({ title: 'Volviendo a la partida…', text: text, ctas: [['bkCancel', 'Cancelar', 'sp-danger']] }); }
  function bkStop(me) { var E = me && me.E; if (E && !E.closed) { E.closed = true; mxStopAll(E); mxCloseLinks(E); } }
  function mxBackTry(b) {
    var lim = b.model === 'host' ? MX_BACK_HOST_MS : MX_BACK_MS;
    if (!(Date.now() - (+b.t || 0) < lim) || !Array.isArray(b.humans) || !(b.seat > 0) || b.seat >= b.humans.length || b.humans.length > 12) return;
    var tries = 0, wait = setInterval(function () {
      var C = ctx(), U = VB.UI;
      if (++tries > 60 || Date.now() - b.t > lim) { clearInterval(wait); return; }
      if (!signedIn() || !C || C.state !== 'menu' || !C.actions || !C.actions.startOnline || !U || !U.menuIdle || !U.menuIdle() || L.room || L.mx || CO || BK) return;
      clearInterval(wait);
      var me = BK = { b: b, E: null, go: false, t0: Date.now() };
      bkSheet('Buscando la sala de ' + (theirName(b.host) || 'el que la ha creado') + '…');
      api().get(b.id).then(function (r) {
        if (BK !== me) return;
        if (!r) { bkFail('gone'); return; }
        var okSt = r.state === 'play' || (r.mode === 'coop' && (r.state === 'full' || r.state === 'coop'));
        if (api().uid() !== b.uid || !r.multi || r.host === b.uid || !(b.uid in (r.seats || {})) || r.age > NR().LIVE_MS || !okSt) { bkFail('nope'); return; }
        mxRejoin(r, b);
      }, function () { if (BK === me) bkFail('net'); });
    }, 500);
  }
  function mxRejoin(r, b) {
    try { if (VB.NetRec && VB.NetRec.resume) VB.NetRec.resume(); } catch (e) { }   // (el partido recuperado hereda la marca del récord)
    var me = BK;
    var E = Mx({ role: 'guest', room: r, coop: r.mode === 'coop', onChange: noop, onNote: noop, onEnd: function (why, E2) { if (BK && BK.E === E2) BK = null; } });
    E.started = true; E.back = b; E.backGo = false; E.gen = b.gen | 0; E.status = 'back'; E.tJoin = Date.now();
    me.E = E;
    bkSheet('Reconectando con la sala de ' + (theirName(r.name, r.host) || theirName(b.host) || 'el que la ha creado') + '. Mientras, tu jugador lo lleva la IA.');
    mxGuestListen(E, E.gen);
    mxEvery(E, 'bkRoom', HOST_CHK_MS, function () {   // (la sala desaparece mientras esperas: quien la creó se ha ido)
      if (BK !== me || E.backGo) { mxStop(E, 'bkRoom'); return; }
      api().get(r.id).then(function (r2) { if (BK === me && !E.backGo && !r2) bkFail('gone'); }, noop);
    });
    mxAfter(E, 'bkT', MX_BACK_WAIT, function () { if (BK === me && !E.backGo) bkFail('noconn'); });
  }
  /** El enlace de la vuelta está abierto: sesión nueva en tu plaza (como mGuestGo, con lo apuntado en la marca). */
  function mxBackOpen(E) {
    var b = E.back, C = ctx(), link = E.hostLink, me = BK;
    E.backGo = true; if (me && me.E === E) me.go = true;
    mxStop(E, 'bkRoom'); mxStop(E, 'bkT');
    coopHide();
    var coop = !!b.coop, ps = b.fmt === '6v6' ? 6 : 2, humans = [];
    for (var k = 0; k < b.humans.length; k++) {
      var h = b.humans[k] || {};
      humans.push({ team: h.team === 1 && !coop ? 1 : 0, idx: Math.max(0, Math.min(ps - 1, h.idx | 0)), role: ROLE6_K.indexOf(h.role) >= 0 ? h.role : '',
        name: theirName(h.name) || 'Jugador ' + (k + 1), look: saneLook(h.look) || (k === b.seat ? myLook() : null) });
    }
    var ep = Math.max(0, Math.min(1e6, b.ep | 0));
    // (modelo anfitrión: la sesión vieja de esta plaza ya no existe; su adiós hace que el saludo de la nueva la readmita con la foto)
    if (b.model === 'host') { try { link.send('ctl', JSON.stringify(ep ? { k: 'bye', why: 'reload', ep: ep } : { k: 'bye', why: 'reload' })); } catch (e) { } }
    link.onclose = function () { mxLinkGone(E, E.room.host); };
    if (coop) {   // (Carrera coop: al salir de la hoja final, el adiós cierra la coop del anfitrión: esta página ya no tiene su Carrera)
      var c0 = link.close;
      link.close = function () { try { if (link.state === 'open') link.send('ctl', JSON.stringify({ k: 'lb-bye' })); } catch (e) { } return c0.apply(link, arguments); };
    }
    var ok = !!(C && C.actions && C.actions.startOnline) && C.actions.startOnline({ humans: humans, seat: b.seat, links: [link], opts: null, name: myName(),
      model: b.model === 'host' ? 'host' : 'precisa', format: b.fmt === '6v6' ? '6v6' : '2v2', expect: b.expect && typeof b.expect === 'object' ? b.expect : null, coop: coop });
    if (!ok) { if (me && me.E === E) BK = null; bkStop({ E: E }); coopSheet({ title: 'Volver a la partida', text: mxWhy('error'), bad: true, ctas: [['ok', 'Entendido', 'sp-gold']] }); return; }
    var n = C.net;
    if (n && n.sess) {
      if (ep) { n.epoch = ep; n.sess.epoch = ep; }   // (revancha n.º k: la sesión nueva habla en la época del anfitrión)
      n.sess.back = true;   // (HUD «Volviendo a la partida…» hasta que llega la foto)
      if (b.cc) n.coopCareer = true;   // (Carrera coop: sin revancha ni récord online)
    }
  }
  /** La vuelta no puede ser: why 'gone' (la sala ya no existe) | 'nope' (ya no tienes plaza o el partido acabó) | 'noconn' | 'net'. */
  function bkFail(why) {
    var me = BK; if (!me) return;
    if (why === 'noconn' && me.E) mxPrefail(me.E, me.E.hostLink, 'noconn', Date.now() - me.t0);   // (antes de cerrar el enlace)
    BK = null; bkStop(me);
    if (why === 'gone') {   // (quien creó la sala se fue: el partido no cuenta, tampoco para tu récord)
      try { var R = VB.NetRec; if (R && R.resume && R.resume()) { R.begin(me.b.host || 'Rival'); R.end(me.b.host || 'Rival', { why: 'hostGone', win: false }, false, null); } } catch (e) { }
    }
    var who = theirName(me.b.host) || 'El que ha creado la sala';
    var txt = why === 'gone' ? who + ' ha cerrado la sala: el partido no cuenta.' : why === 'noconn' ? 'No se ha podido volver a conectar con la sala de ' + who + '.' :
      why === 'net' ? errText({ code: 'net' }) : 'Ya no se puede volver a esa partida.';
    coopSheet({ title: 'Volver a la partida', text: txt, bad: true, ctas: [['ok', 'Entendido', 'sp-gold']] });
  }
  /** «Cancelar» en «Volviendo a la partida…»: dejas el partido (la marca del récord cuenta como abandono a los 90 s). */
  function bkCancel() { var me = BK; BK = null; bkStop(me); coopHide(); }

  setTimeout(backTry, 300);

  // ?sala=CÓDIGO: abre Online y entra en esa sala en cuanto el menú está libre
  if (Q.sala && NR && VB.NetRoom) {
    var tries = 0, wait = setInterval(function () {
      var C = ctx(), U = VB.UI;
      if (++tries > 120) { clearInterval(wait); return; }
      if (!C || C.state !== 'menu' || !U || !U.menuIdle || !U.menuIdle()) return;
      clearInterval(wait);
      L.pendingCode = String(Q.sala);
      if (U.menuGo) U.menuGo('online');
    }, 500);
  }

  VB.NetLobby = {
    menuOn: function () { return MENU_ON || Q.online === '1' || !!EMU; },
    open: open, leave: leave, back: back, side: side, focus: first,
    myName: myName, myStats: myStats, myLook: myLook, saneLook: saneLook, others: others, report: function () { reportOpen(others(), L.mx && L.mx.room ? L.mx.room.code : L.room ? L.room.code : ''); }, _ver: ver, backAlive: mxBackAlive,   // (_ver: pruebas, la versión de sala que publica; backAlive: main.js, página oculta)
    _state: function () {
      var E = L.mx, st = { view: L.view, role: L.role, rival: L.rival, status: L.status, started: L.started, rooms: L.rooms.map(function (r) { return { id: r.id, name: r.name, other: r.other, multi: !!r.multi, fmt: r.fmt, cap: r.cap, nseat: r.nseat }; }), room: L.room && { id: L.room.id, code: L.room.code, state: L.room.state, multi: !!L.room.multi, fmt: L.room.fmt, cap: L.room.cap }, link: L.link && L.link.state, linkInfo: L.link && L.link.info(), msg: L.msg, fail: L.fail, emu: EMU };
      // (online de varios) la sala: quién está, sitios, listos, pings; los enlaces por uid; ¿se puede empezar?
      if (BK) st.bk = { go: !!BK.go, seat: BK.b.seat, room: BK.b.id, link: BK.E && BK.E.hostLink ? BK.E.hostLink.state : '' };   // (lane A: vuelta en el de varios)
      if (E) { var lk = {}; for (var u in E.links) lk[u] = E.links[u] && E.links[u].state; st.mx = { role: E.role, status: E.status, started: E.started, ro: JSON.parse(JSON.stringify(E.ro)), links: lk, can: mxCanStart(E), pick: L.pick || '', me: E.myU }; }
      return st;
    },
    // (online de varios, pruebas: tools/lobbytest.js) las mismas acciones que los botones de la sala de espera
    _act: function (a, v) {
      if (a === 'create') { L.cfg = cfgFix(Object.assign(prefs(), v || {})); createRoom(); return true; }
      if (a === 'join') { joinRoom(v); return true; }
      if (a === 'code') { joinCode(v); return true; }
      if (a === 'chair') { mChair(v | 0); return true; }
      if (a === 'pick') { mPick(v); return true; }
      if (a === 'ready') { mReady(); return true; }
      if (a === 'start') { mStart(); return true; }
      if (a === 'swap') { mSwap(); return true; }
      if (a === 'kick') { mKick(); return true; }
      if (a === 'leave') { leaveRoom(); L.view = 'list'; return true; }
      return false;
    },
    _mx: function () { return L.mx; },
    _link: function () { return L.link; },
    // Carrera cooperativa (P7): ver «CARRERA COOPERATIVA» arriba
    coop: { host: coopHost, join: coopJoin, close: coopClose, send: coopSend,
      onMessage: function (fn) { if (typeof fn !== 'function') return noop; COH.push(fn); return function () { var i = COH.indexOf(fn); if (i >= 0) COH.splice(i, 1); }; },
      state: function () { return { on: !!CO, role: CO ? CO.role : '', ready: !!(CO && CO.ready), code: CO && CO.E ? CO.E.room.code : '' }; } },
    // capturas con ?olmock: pinta un estado suelto (o = campos de L: msg, msgBad, listErr, status, rival, fail, view…; rival: '<nombre>'
    // llega un rival a tu sala de mentira). Sin ?olmock no hace nada.
    _mock: function (o) {
      if (!MOCK || !o) return false;
      if (o.arrive && rooms && rooms._rival) { rooms._rival(o.arrive); delete o.arrive; }
      if (o.coopDemo === 'off' || o.multiDemo) { coopHide(); if (o.coopDemo === 'off') return true; }
      if (o.multiDemo) { mDemo(o.multiDemo, o.role); if (o.pick && L.mx) { var pk = L.mx.ro.m.filter(function (m) { return !m.h && m.ok && m.c >= 0; })[1]; if (pk) L.pick = pk.u; render(true); } return true; }   // (sala de varios de muestra)
      if (o.coopDemo) { coopSheet(o.coopDemo === 'guest' ? { title: 'Carrera cooperativa', text: 'Conectando con la Carrera de Lucía Marín…', ctas: [['cancel', 'Cancelar', 'sp-danger']] }
        : { title: 'Carrera cooperativa', text: 'Pasa el código o el enlace a quien vaya a jugar contigo. Esperando…', code: 'Q4WX8M', ctas: [['cancel', 'Cancelar', 'sp-danger'], ['share', 'Compartir', 'sp-kit']] }); return true; }
      var v = o.view; delete o.view;
      if (v && v !== 'room' && L.mx && L.mx.mock) { L.pick = ''; leaveRoom(); }   // (otra vista: fuera la sala de varios de muestra)
      for (var k in o) L[k] = o[k];
      if (v) setView(v); else render(true);
      return true;
    }
  };
})();
