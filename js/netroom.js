/* =====================================================================
 * TAKE THE COURT — js/netroom.js   (owner: net)
 * Modo online, fase 2 (notes/net.md «Fase 2»): salas del lobby y señalización de WebRTC en Firestore por REST, con el token de la
 * cuenta (js/account.js). SIN DOM y SIN THREE: funciona igual en el navegador y en Node (tools/roomtest.js lo prueba contra el
 * emulador de Firestore o con un fetch simulado).
 *
 * Modelo de datos (reglas en firebase/firestore.rules, bloque ONLINE):
 *   rooms/{uidAnfitrión} = {code, name, gname, host, guest, fmt, venue, map, even, bo, pts, state: open|full|play, v, seen, net?}
 *     (net = 'fluida' solo en las salas de conexión Fluida, Online V2; sin la clave = Precisa)
 *     (seen = hora del SERVIDOR: transformación REQUEST_TIME en cada escritura del anfitrión; el latido la renueva)
 *   rooms/{uid}/sig/offer = {sdp, gen, to} (anfitrión; to = uid del invitado) · rooms/{uid}/sig/answer = {sdp, gen, uid} (invitado)
 *   Nunca hay correos: del rival solo viaja su nombre visible (name/gname; al leer, uno con insultos sale como «Jugador NNNN»:
 *   js/namefilter.js). Cada SDP (con direcciones de red) solo la lee su
 *   destinatario y el anfitrión (nunca un invitado posterior); se borran al conectar, al salir y al reabrir; el juego nunca las enseña.
 *
 * API: VB.NetRoom.create({base, auth, fetch, ver}) → rooms
 *   base  = 'https://firestore.googleapis.com/v1/projects/<p>/databases/(default)/documents' (o la del emulador)
 *   auth  = () → Promise<{uid, token}>   (VB.Account.netAuth en el juego)
 *   ver   = cadena de versión (PROTO|VB.VERSION): una sala de otra versión sale en la lista como «otra versión» y no deja entrar
 *   rooms.list()                 → Promise<[sala]> abiertas y vivas (la más nueva primero); de paso borra hasta 3 caducadas
 *   rooms.open(cfg)              → Promise<sala> crea (o rehace) TU sala: cfg = {name, venue, map, even, bo, pts, net?}
 *   rooms.beat(patch)            → Promise<sala> latido del anfitrión (y cambios: {state, guest, gname}); null si ya no existe
 *   rooms.get(id) / rooms.byCode(code) → Promise<sala|null>
 *   rooms.join(id, gname)        → Promise<sala> (errores: full | gone | version | off | auth | net)
 *   rooms.leave(id)              → Promise   el invitado sale antes de empezar (la sala vuelve a 'open')
 *   rooms.close()                → Promise   el anfitrión borra su sala y su señalización
 *   rooms.resume()               → Promise<sala|null> fase 6: el anfitrión que recargó retoma SU sala (rooms/{tu uid}) para latir y
 *                                  reofrecer; null si ya no existe. Su pagehide en pleno partido no la borra (la vuelta la necesita).
 *   rooms.bye(role, id)          → (nada)    al cerrar la pestaña: close() o leave(id) con fetch keepalive, sin esperar
 *   rooms.putSig(id, 'offer'|'answer', {sdp, gen}) / rooms.getSig(id, kind) → {sdp, gen}|null / rooms.delSig(id)
 *   sala = {id, code, name, gname, host, guest, fmt, venue, map, even, bo, pts, state, v, seen (ms del servidor), age (ms), other (otra versión)}
 *   Errores: Error con .code = 'off' (las reglas del online aún no están desplegadas: 403 al listar, o al crear si tampoco se lista), 'denied' (403 en lo
 *   demás), 'auth' (sin sesión), 'net' (sin conexión), 'full', 'gone', 'version', 'error'.
 *
 * ---- ESQUEMA v3: SALAS DE VARIOS (online multi, notes/online-multi-brief.md §4; para el lobby de P6) ----
 * Aditivo: las salas 1 contra 1 de siempre (sin la clave cap) no cambian NADA (ni campos, ni llamadas, ni reglas: un cliente 1.21.0
 * en caché sigue funcionando con ellas). Una sala de varios lleva además:
 *   mode  'vs' (dos equipos) | 'coop' (Carrera cooperativa: todos los humanos en el mismo equipo; NO sale en list(), solo por código
 *         o enlace: byCode/get)
 *   cap   plazas humanas contando al anfitrión: 2 | 4 | 12. Combinaciones (CAPS): vs 2v2 → 2|4 · vs 6v6 → 2|4|12 · coop 2v2 → 2 ·
 *         coop 6v6 → 2|4. 6v6 siempre en Pabellón (venue 'hall'). Fluida (net) solo en vs con cap 2 (2v2×4 va en Precisa).
 *   fmt   formato del partido ('2v2' | '6v6'; en las 1v1 sigue siendo '2v2')
 *   seats {<uid>: {n: nombre visible, at: hora del SERVIDOR al sentarse}}: los invitados (el anfitrión NO está). Cada invitado solo
 *         toca SU clave (entrar/salir); como mucho cap-1 claves (lo hacen cumplir las reglas). guest y gname se quedan en ''.
 *   cnt   invitados que el anfitrión da por dentro (conectados) 0..cap-1; solo lo escribe el anfitrión (beat({cnt})).
 *   lineup (opcional) texto del anfitrión (≤ 4000; p. ej. JSON de plazas/equipos/roles) para el lobby.
 *   Estado: 'open' mientras se puede entrar (las reglas paran en cap-1 aunque siga 'open'); el anfitrión lo pasa a 'full'/'play'.
 *         Una coop esperando compañero va en 'coop' (nunca 'open'): los clientes 1.21.0 en caché listan y buscan por código solo
 *         state == 'open', así que no la ven (los 1.22.0 publicados tampoco); los 1.23.0 entran por código (byCode acepta 'open' y 'coop') o por enlace.
 *   net   (opcional) 'fluida' (vs, cap 2, 2v2) | 'host' (modelo del anfitrión: siempre en 6v6; las reglas lo dejan también en vs 2v2
 *         de 4 plazas). Sin la clave = Precisa. multiCfg lo pone solo.
 *   Señalización POR PAREJA (anfitrión ↔ cada invitado), la clave de la pareja es SIEMPRE el uid del invitado:
 *     rooms/{id}/sig/o_<uidInvitado> = {sdp, gen} (oferta del anfitrión) · rooms/{id}/sig/a_<uidInvitado> = {sdp, gen} (su respuesta)
 *     Lee o_: el anfitrión y ese invitado. Lee a_: ese invitado y el anfitrión mientras ese invitado esté sentado. Nadie más.
 *     Solo se escriben para un invitado sentado (seats). Bórralas en cuanto abra el enlace (delSig(id, uid)).
 *
 *   rooms.open(cfg)              cfg += {mode, cap, fmt, lineup}: con cualquiera de mode/cap (o fmt '6v6', o multi: true) la sala es
 *                                de varios (lo que no cuadre se corrige: ver CAPS); sin ellos, 1v1 como siempre. Al reabrir borra la
 *                                señalización por pareja de los invitados de la sala anterior (1 lectura más).
 *   rooms.join(id, gname)        en una sala de varios hace joinMulti (el lobby puede llamar siempre a join)
 *   rooms.joinMulti(id, gname)   → Promise<sala> te sienta (seats.<tu uid>); errores: full | gone | version | denied | net | auth.
 *                                Coste: 1 lectura + 1 escritura (la sala devuelta ya lleva tu plaza, sin releer).
 *   rooms.leaveMulti(id)         → Promise   te levantas antes de empezar (borra antes tu a_<uid>); en 'play' las reglas no dejan
 *                                (como en 1v1: la vuelta tras recargar necesita la plaza). rooms.leave(id) también vale si entraste
 *                                con este cliente.
 *   rooms.kick(uid)              → Promise<sala|null> el anfitrión levanta a un invitado (y late)
 *   rooms.beat(patch, o)         patch admite también {cnt, lineup, state, seats (entero)}. o.lite: sin la lectura de después (1
 *                                escritura en vez de 1 escritura + 1 lectura); devuelve tu sala tal como la escribiste, o null
 *                                si ya no existe (la escritura lleva currentDocument.exists). Para latidos en los que no se mira
 *                                la sala (sala de varios ya en marcha, coop emparejada, cnt).
 *   rooms.putSig(id, 'offer'|'answer', {sdp, gen}, uidInvitado) / rooms.getSig(id, kind, uidInvitado) → {sdp, gen, to, uid}|null
 *   rooms.delSig(id, uidInvitado | [uids])   sin el tercer argumento (o sin el segundo de delSig): los documentos 1v1 offer/answer.
 *                                El invitado pasa SU uid (rooms.uid()); el anfitrión, el del invitado de esa pareja.
 *   close / bye('host') / _sweep / sweep borran también las o_/a_ de todos los invitados que la sala tuvo (los que este cliente vio
 *   y los que hay ahora). bye('guest', id) en una sala de varios: borra tu a_ y te levanta (keepalive).
 *   sala de varios += {mode, cap, seats, cnt, lineup?, multi: true, nseat (invitados sentados), free (plazas libres = cap-1-nseat)}.
 *   list(): sin las coop y sin las de varios ya sin plazas. Conteo por entrada (tools/roomtest.js lo mide contra el emulador).
 *   VB.NetRoom.CAPS / VB.NetRoom.multiCfg(cfg) (normaliza mode/cap/fmt/venue/net; null = sala 1v1).
 * ===================================================================== */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : globalThis;
  var VB = root.VB = root.VB || {};

  var ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // sin 0/O, 1/I/L
  var LIVE_MS = 90000;      // una sala sin latido en 90 s ya no sale en la lista (las reglas tampoco dejan entrar)
  var STALE_MS = 300000;    // a los 5 min cualquiera con sesión puede borrarla (limpieza)
  var BEAT_MS = 20000;      // latido del anfitrión (3 por minuto). Con la pestaña en segundo plano más de 5 min, Chrome deja los
                            // temporizadores en 1 por minuto: por eso LIVE_MS deja margen para un latido de cada 60 s.
  var LIST_MAX = 50;   // (auditoría: las reglas dejan listar hasta 50; ahora por latido, también cuentan las llenas y las que juegan)

  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function newCode(rnd) { var s = ''; for (var i = 0; i < 6; i++) s += ALPHA[Math.floor((rnd || Math.random)() * ALPHA.length) % ALPHA.length]; return s; }
  function codeOk(c) { return typeof c === 'string' && /^[2-9A-HJKMNP-Z]{6}$/.test(c); }
  function normCode(c) { return String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6); }
  /** Nombre visible: sin controles ni < >, espacios plegados, 2-16 unidades UTF-16 (como cuentan las reglas: size() de un string;
   *  un emoji suele valer 2), sin partir un emoji por la mitad. '' si no vale. */
  function cleanName(n) {
    var s = String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f<>"`]/g, '').replace(/\s+/g, ' ').trim();
    if (s.indexOf('@') >= 0) return '';   // nunca algo con pinta de correo
    var out = '', cs = Array.from(s);
    for (var i = 0; i < cs.length && out.length + cs[i].length <= 16; i++) out += cs[i];
    s = out.trim();
    return s.length >= 2 ? s : '';
  }

  /* ---- valores de Firestore ---- */
  // (esquema v3: también mapas y listas, para seats; los escalares se codifican exactamente igual que antes)
  function enc(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
    if (typeof v === 'object') { var f = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) f[k] = enc(v[k]); return { mapValue: { fields: f } }; }
    return { stringValue: String(v) };
  }
  function dec1(x) {
    if (!x || typeof x !== 'object') return null;
    if ('stringValue' in x) return x.stringValue;
    if ('booleanValue' in x) return x.booleanValue;
    if ('integerValue' in x) return +x.integerValue;
    if ('doubleValue' in x) return +x.doubleValue;
    if ('timestampValue' in x) return Date.parse(x.timestampValue);
    if ('mapValue' in x) return dec((x.mapValue && x.mapValue.fields) || {});
    if ('arrayValue' in x) return ((x.arrayValue && x.arrayValue.values) || []).map(dec1);
    return null;
  }
  function dec(f) {
    var o = {};
    for (var k in f) o[k] = dec1(f[k]);
    return o;
  }
  var ROOM_KEYS = ['code', 'name', 'gname', 'host', 'guest', 'fmt', 'venue', 'map', 'even', 'bo', 'pts', 'state', 'v', 'net',
    'mode', 'cap', 'seats', 'cnt', 'lineup', 'ban'];   // (las seis últimas: solo salas de varios, esquema v3)
  var BAN_MAX = 20;   // (ban: a quien el anfitrión sacó; las reglas lo topan en 20)

  /* ---- salas de varios (esquema v3) ---- */
  // plazas humanas (con el anfitrión) admitidas por modo y formato; la primera es la de por defecto (las reglas dicen lo mismo)
  var CAPS = { vs: { '2v2': [4, 2], '6v6': [12, 4, 2] }, coop: { '2v2': [2], '6v6': [2, 4] } };
  /** cfg de open() → {mode, cap, fmt, venue, fluida, net, state} normalizado, o null si es una sala 1v1 de las de siempre.
   *  net: 'fluida' | 'host' | '' (Precisa); el 6v6 siempre 'host'; 'host' en 2v2 solo si se pide y es vs de 4 plazas.
   *  state: el de una sala recién abierta ('open'; 'coop' en las coop: así un 1.21.0 no la lista). */
  function multiCfg(cfg) {
    cfg = cfg || {};
    if (cfg.cap == null && cfg.mode == null && cfg.fmt !== '6v6' && !cfg.multi) return null;
    var mode = cfg.mode === 'coop' ? 'coop' : 'vs', fmt = cfg.fmt === '6v6' ? '6v6' : '2v2', ok = CAPS[mode][fmt];
    var cap = ok.indexOf(+cfg.cap) >= 0 ? +cfg.cap : ok[0];
    var fluida = cfg.net === 'fluida' && mode === 'vs' && cap === 2 && fmt === '2v2';   // (Fluida es de 2 plazas y solo 2v2: NPL = 2)
    var host = fmt === '6v6' || (cfg.net === 'host' && mode === 'vs' && cap === 4);
    return { mode: mode, cap: cap, fmt: fmt, venue: fmt === '6v6' ? 'hall' : (cfg.venue === 'beach' ? 'beach' : 'hall'),
      fluida: fluida, net: fluida ? 'fluida' : host ? 'host' : '', state: mode === 'coop' ? 'coop' : 'open' };
  }
  /** Estado en el que una sala de varios admite invitados: 'open' (vs) o 'coop' (coop esperando compañero). */
  function joinable(r) { return !!r && (r.state === 'open' || (r.state === 'coop' && r.mode === 'coop')); }
  /** Ruta de campo para una clave de seats (uid): siempre entre comillas invertidas (un uid puede empezar por cifra). */
  function seatPath(uid) { return 'seats.`' + String(uid).replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`'; }
  function banPath(uid) { return 'ban.`' + String(uid).replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`'; }
  function seatUids(r) { return r && r.seats && typeof r.seats === 'object' ? Object.keys(r.seats) : []; }
  function pairDoc(kind, uid) { return (kind === 'answer' ? 'a_' : 'o_') + uid; }

  function create(o) {
    o = o || {};
    var base = String(o.base || '').replace(/\/+$/, ''), auth = o.auth, F = o.fetch || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
    var docRoot = base.slice(base.indexOf('projects/'));   // projects/<p>/databases/(default)/documents
    var ver = String(o.ver || '');
    var me = null;      // {uid, token} de la última llamada
    var mine = null;    // tu sala (anfitrión): último estado escrito
    var known = {};     // salas de varios: uids de invitados que este cliente ha visto en TU sala (para borrar su señalización)
    // (y una copia en el almacén del navegador: tras una recarga o un cierre a medias, open() aún sabe a quién borrar la o_/a_. Un
    //  cliente 1.21.0 que barre la sala caducada borra la sala pero no las o_/a_, y la sala nueva ya no las lista: sin esto se quedaban)
    var store = o.store !== undefined ? o.store : (function () { try { return root.localStorage || null; } catch (e) { return null; } })();
    var PAIRS_KEY = 'make-the-cut.netroom.pairs';
    function pairsRead(uid) { try { var v = store && JSON.parse(store.getItem(PAIRS_KEY) || 'null'); return v && v.h === uid && Array.isArray(v.u) ? v.u.filter(function (x) { return typeof x === 'string' && x.length <= 128; }).slice(0, 64) : []; } catch (e) { return []; } }
    function pairsSave() { try { if (store && me) { var u = pairsRead(me.uid); for (var k in known) if (u.indexOf(k) < 0) u.push(k); store.setItem(PAIRS_KEY, JSON.stringify({ h: me.uid, u: u.slice(-64) })); } } catch (e) { } }
    function pairsClear(uid, done) { try { if (store) { var u = pairsRead(uid).filter(function (x) { return done.indexOf(x) < 0; }); if (u.length) store.setItem(PAIRS_KEY, JSON.stringify({ h: uid, u: u })); else store.removeItem(PAIRS_KEY); } } catch (e) { } }
    var joinedM = {};   // salas de varios donde te sentaste con este cliente (leave/bye saben que es una sala de varios)
    var skew = null;    // hora del servidor - Date.now() (ms), de la última readTime / commitTime: la edad de get() sin readTime
    function noteSrv(t) { var v = t ? Date.parse(t) : NaN; if (v === v) skew = v - Date.now(); }

    function call(method, url, body, quiet404) {
      if (!F) return Promise.reject(err('net', 'sin fetch'));
      return Promise.resolve().then(function () { return auth(); }).catch(function (e) { throw err('auth', e && e.message); }).then(function (a) {
        if (!a || !a.uid || !a.token) throw err('auth');
        me = a;
        var opt = { method: method, headers: { Authorization: 'Bearer ' + a.token } };
        if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
        return F(url, opt).then(null, function () { throw err('net', 'sin conexión'); });
      }).then(function (r) {
        if (r.status === 404 && quiet404) return null;
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : {}; } catch (e) { j = {}; }
          if (!r.ok) {
            var m = j && (Array.isArray(j) ? j[0] && j[0].error : j.error), msg = m && m.message || ('HTTP ' + r.status);
            throw err(r.status === 403 ? 'denied' : r.status === 401 ? 'auth' : r.status === 404 ? 'gone' : r.status === 409 || r.status === 412 ? 'conflict' :
              r.status >= 500 || r.status === 429 ? 'net' : 'error', msg);
          }
          if (j && j.commitTime) noteSrv(j.commitTime);
          else if (Array.isArray(j) && j[0] && j[0].readTime) noteSrv(j[0].readTime);
          return j;
        });
      });
    }
    function docUrl(path) { return base + '/' + path; }
    function room(doc, readTime) {
      if (!doc || !doc.fields) return null;
      var d = dec(doc.fields), id = String(doc.name || '').split('/').pop();
      d.id = id;
      // (get() no trae readTime y updateTime se congela si el anfitrión deja de escribir: con la hora del servidor conocida, esa)
      var ut = doc.updateTime ? Date.parse(doc.updateTime) : NaN;
      var now = readTime ? Date.parse(readTime) : skew !== null ? Math.max(Date.now() + skew, ut === ut ? ut : 0) : (ut === ut ? ut : Date.now());
      d.age = d.seen ? Math.max(0, now - d.seen) : 1e12;
      d.other = !!ver && d.v !== ver;
      // esquema v3: sala de varios (con cap); las 1v1 salen exactamente como antes
      if (typeof d.cap === 'number') {
        if (!d.seats || typeof d.seats !== 'object') d.seats = {};
        d.multi = true; d.nseat = seatUids(d).length; d.free = Math.max(0, d.cap - 1 - d.nseat);
      }
      // nombres de otros: un insulto se enseña como «Jugador NNNN» (VB.NameFilter, número sacado de su uid). Solo al leer: nada de
      // esto se vuelve a escribir (beat() solo manda los campos del parche; seats entero solo lo escribe el anfitrión al sacar a
      // alguien, y entonces cada plaza lleva el nombre tapado, que también vale)
      var F = VB.NameFilter;
      // (name0 / gname0 / n0: el nombre tal cual llegó, solo para «Denunciar nombre» de js/report.js; nunca se enseña ni se reescribe)
      if (typeof d.name === 'string') d.name0 = d.name;
      if (typeof d.gname === 'string') d.gname0 = d.gname;
      if (d.multi) for (var s0 in d.seats) { var v0 = d.seats[s0]; if (v0 && typeof v0 === 'object' && typeof v0.n === 'string') v0.n0 = v0.n; }
      if (F) {
        if (typeof d.name === 'string') d.name = F.shown(d.name, d.host);
        if (typeof d.gname === 'string' && d.gname) d.gname = F.shown(d.gname, d.guest);
        if (d.multi) for (var su in d.seats) { var sv = d.seats[su]; if (sv && typeof sv === 'object' && typeof sv.n === 'string') sv.n = F.shown(sv.n, su); }
      }
      return d;
    }
    function noteSeats(r) {
      if (r && me && r.id === me.uid) { var n = 0; seatUids(r).forEach(function (u) { if (!known[u]) n++; known[u] = 1; }); if (n) pairsSave(); }
      return r;
    }
    /** Borra la señalización por pareja de esos invitados (o_ y a_), sin fallar. */
    function delPairs(id, uids) {
      var L = []; (uids || []).forEach(function (u) { if (u) L.push(call('DELETE', docUrl('rooms/' + id + '/sig/o_' + u), null, true).catch(function () { }), call('DELETE', docUrl('rooms/' + id + '/sig/a_' + u), null, true).catch(function () { })); });
      return Promise.all(L).then(function () { });
    }
    /** Escritura con seen = hora del servidor (documents:commit con transformación). mask = campos que se tocan (sin mask: el doc entero). */
    function commitRoom(id, fields, mask, exists) {
      var f = {}; for (var k in fields) f[k] = enc(fields[k]);
      var w = { update: { name: docRoot + '/rooms/' + id, fields: f }, updateTransforms: [{ fieldPath: 'seen', setToServerValue: 'REQUEST_TIME' }] };
      if (mask) w.updateMask = { fieldPaths: mask };
      if (exists != null) w.currentDocument = { exists: !!exists };
      return call('POST', base + ':commit', { writes: [w] });
    }
    function query(where, limit, order) {
      var q = { from: [{ collectionId: 'rooms' }], limit: limit };
      if (where) q.where = where;
      if (order) q.orderBy = order;
      return call('POST', base + ':runQuery', { structuredQuery: q }).then(function (rows) {
        var out = [];
        (Array.isArray(rows) ? rows : []).forEach(function (x) { var r = x && x.document ? room(x.document, x.readTime) : null; if (r) out.push(r); });
        return out;
      });
    }
    function eq(field, v) { return { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(v) } }; }

    /** Esquema v3: te sienta en r (ya leída). 1 escritura: commit con máscara seats.<uid> y at = hora del servidor (transformación). */
    function joinM(r, gname) {
      var id = r.id, uid = me.uid, n = cleanName(gname) || 'Jugador';
      if (r.host === uid) throw err('denied', 'es tu sala');
      if (r.ban && typeof r.ban === 'object' && r.ban[uid]) throw err('kicked', 'te sacaron de esta sala');   // (las reglas dirían lo mismo, con 403)
      if (!joinable(r) || (r.free <= 0 && !(uid in r.seats))) throw err('full');
      var seat = {}; seat[uid] = { mapValue: { fields: { n: { stringValue: n } } } };
      var w = { update: { name: docRoot + '/rooms/' + id, fields: { seats: { mapValue: { fields: seat } } } }, updateMask: { fieldPaths: [seatPath(uid)] },
        updateTransforms: [{ fieldPath: seatPath(uid) + '.at', setToServerValue: 'REQUEST_TIME' }], currentDocument: { exists: true } };
      return call('POST', base + ':commit', { writes: [w] }).then(function (j) {
        joinedM[id] = 1;
        var t = j && j.writeResults && j.writeResults[0] && j.writeResults[0].transformResults && j.writeResults[0].transformResults[0];
        r.seats[uid] = { n: n, at: t && t.timestampValue ? Date.parse(t.timestampValue) : Date.now() };
        r.nseat = seatUids(r).length; r.free = Math.max(0, r.cap - 1 - r.nseat);
        return r;
      }, function (e) {
        if (e.code === 'denied' || e.code === 'gone' || e.code === 'conflict') return api.get(id).then(function (r2) {
          throw err(!r2 || r2.age > LIVE_MS ? 'gone' : r2.multi && (!joinable(r2) || r2.free <= 0) && !(uid in r2.seats) ? 'full' : 'denied', e.message);
        }, function () { throw err('denied', e.message); });
        throw e;
      });
    }

    var api = {
      LIVE_MS: LIVE_MS, STALE_MS: STALE_MS, BEAT_MS: BEAT_MS,
      uid: function () { return me && me.uid; },
      /** Salas abiertas y vivas, la más nueva primero. 403 aquí = reglas sin desplegar ('off'). */
      // (auditoría: por latido, la más reciente primero, y el estado se filtra aquí: antes state=='open' sin orden devolvía las 40 de uid
      //  más bajo, y 40 salas abiertas que no servían, caducadas o de otra versión, escondían las nuevas. Un solo campo: índice automático)
      list: function () {
        return query(null, LIST_MAX, [{ field: { fieldPath: 'seen' }, direction: 'DESCENDING' }]).then(function (L) {
          // (de paso, hasta 3 caducadas de cualquier estado —también 'play', 'coop' o 'full' que se quedaron sin latido—, con su señalización)
          var dead = L.filter(function (r) { return r.age > STALE_MS + 30000 && r.host !== (me && me.uid); }).slice(0, 3);
          L = L.filter(function (r) { return r.state === 'open'; });
          dead.forEach(function (r) { api._sweep(r.id, r).catch(function () { }); });
          var mineId = me && me.uid;
          // (esquema v3: las coop no se listan, solo por código o enlace; las de varios sin plaza libre tampoco)
          return L.filter(function (r) { return r.age < LIVE_MS && r.host !== mineId && r.mode !== 'coop' && !(r.multi && r.free <= 0); })
            .sort(function (a, b) { return a.age - b.age; });
        }, function (e) { if (e.code === 'denied') throw err('off', e.message); throw e; });
      },
      /** Limpieza: también las salas llenas o jugando que se quedaron sin latido (las abiertas caen en list). */
      sweep: function () {
        var cut = new Date(Date.now() - STALE_MS - 60000).toISOString();
        return query({ fieldFilter: { field: { fieldPath: 'seen' }, op: 'LESS_THAN', value: { timestampValue: cut } } }, 5).then(function (L) {
          return Promise.all(L.filter(function (r) { return r.age > STALE_MS + 30000; }).map(function (r) { return api._sweep(r.id, r).catch(function () { }); }));
        });
      },
      /** r (opcional) = la sala tal como se leyó: si es de varios, también se borran las o_/a_ de sus invitados. */
      _sweep: function (id, r) {
        return Promise.all(['offer', 'answer'].map(function (k) { return call('DELETE', docUrl('rooms/' + id + '/sig/' + k), null, true).catch(function () { }); }).concat([delPairs(id, seatUids(r))]))
          .then(function () { return call('DELETE', docUrl('rooms/' + id), null, true); });
      },
      /** Crea (o rehace) tu sala: rooms/{tu uid}. */
      open: function (cfg) {
        cfg = cfg || {};
        return Promise.resolve().then(function () { return auth(); }).catch(function (e) { throw err('auth', e && e.message); }).then(function (a) {
          me = a;
          var d = { code: codeOk(cfg.code) ? cfg.code : newCode(), name: cleanName(cfg.name) || 'Jugador', gname: '', host: a.uid, guest: '', fmt: '2v2',
            venue: cfg.venue === 'beach' ? 'beach' : 'hall', map: String(cfg.map || '').slice(0, 40), even: !!cfg.even, bo: +cfg.bo === 3 ? 3 : 1,
            pts: [11, 15, 21, 25].indexOf(+cfg.pts) >= 0 ? +cfg.pts : 21, state: 'open', v: ver.slice(0, 40) };
          // Online V2: la conexión Fluida va en la sala (net = 'fluida'); en las Precisa la clave no existe (salas como siempre)
          var mc = multiCfg(cfg);
          if (!mc) { if (cfg.net === 'fluida') d.net = 'fluida'; }
          else {
            // esquema v3: sala de varios (seats vacío, cnt 0; guest/gname se quedan en '')
            d.fmt = mc.fmt; d.venue = mc.venue; d.mode = mc.mode; d.cap = mc.cap; d.seats = {}; d.cnt = 0; d.state = mc.state;
            if (mc.net) d.net = mc.net;
            if (typeof cfg.lineup === 'string' && cfg.lineup.length <= 4000) d.lineup = cfg.lineup;
          }
          // (auditoría: un código nuevo que ya usa otra sala viva se cambia; el de tu sala de antes, cfg.code, se respeta)
          var fresh = !codeOk(cfg.code), tries = 0;
          var pick = function () {
            if (!fresh || tries++ >= 3) return Promise.resolve();
            return query(eq('code', d.code), 2).then(function (L) {
              if (L.some(function (r) { return r.host !== a.uid && r.age < STALE_MS; })) { d.code = newCode(); return pick(); }
            }, function () { });
          };
          // (antes de abrir: fuera la señalización de una sesión anterior que no se cerró, p. ej. una recarga a mitad de conexión)
          // (esquema v3: y la señalización por pareja de los invitados de la sala anterior, si era de varios: se leen de la sala vieja)
          var prevPairs = function () {
            var u = pairsRead(a.uid);
            var del = function () { for (var k in known) if (u.indexOf(k) < 0) u.push(k); known = {}; return delPairs(a.uid, u).then(function () { pairsClear(a.uid, u); }); };
            return api.get(a.uid).then(function (r) { seatUids(r).forEach(function (x) { if (u.indexOf(x) < 0) u.push(x); }); return del(); }, del);
          };
          return pick().then(function () { return Promise.all([api.delSig(a.uid), prevPairs()]); }).then(function () { return commitRoom(a.uid, d, null, null); }).then(function () { mine = d; return api.get(a.uid); }, function (e) {
            if (e.code !== 'denied') throw e;
            // 403 al crear: 'off' solo si tampoco se puede listar (reglas sin desplegar); si no, es un dato que las reglas no aceptan
            return query(eq('state', 'open'), 1).then(function () { throw err('denied', e.message); }, function (e2) { throw err(e2.code === 'denied' ? 'off' : e2.code, e.message); });
          });
        });
      },
      /** Latido del anfitrión; con patch cambia estado / invitado ({state, guest, gname}). null si la sala ya no existe. */
      beat: function (patch, o) {
        if (!mine || !me) return Promise.resolve(null);
        var lite = !!(o && o.lite);
        // solo los campos del patch (nunca se reescribe guest/gname con lo que había: el invitado puede haber entrado entre medias)
        var d = {}, mask = [];
        if (patch) for (var k in patch) if (ROOM_KEYS.indexOf(k) >= 0) { d[k] = patch[k]; mask.push(k); }
        var w = mask.length ? null : { transform: { document: docRoot + '/rooms/' + me.uid, fieldTransforms: [{ fieldPath: 'seen', setToServerValue: 'REQUEST_TIME' }] }, currentDocument: { exists: true } };
        var p = w ? call('POST', base + ':commit', { writes: [w] }) : commitRoom(me.uid, d, mask, true);
        return p.then(function () {
          for (var k2 in d) mine[k2] = d[k2];
          // (lite: sin releer; la escritura ya falla si la sala no existe. Copia con id, para quien mire r.id / r.state)
          if (lite) { var c = { id: me.uid }; for (var k3 in mine) c[k3] = mine[k3]; return c; }
          return api.get(me.uid);
        }, function (e) {
          if (e.code === 'gone' || e.code === 'conflict' || /NOT_FOUND|no entity/i.test(e.message)) { mine = null; return null; }
          throw e;
        });
      },
      /** El anfitrión lee su sala tal como está (el invitado puede haber entrado o salido). */
      get: function (id) { return call('GET', docUrl('rooms/' + id), null, true).then(function (j) { return j ? noteSeats(room(j)) : null; }); },
      byCode: function (code) {
        code = normCode(code); if (!codeOk(code)) return Promise.resolve(null);
        // (auditoría: las reglas no exigen código único y otra cuenta puede copiar el de una sala ajena: con más de una sala viva con ese
        //  código no se elige ninguna, 'dup', en vez de entrar en la de uid más bajo)
        // (esquema v3: también las coop que esperan compañero, state 'coop'. Se filtra aquí y no en la consulta: un solo campo en el
        //  filtro = índice automático; con el código casi único, 5 filas sobran)
        return query(eq('code', code), 5).then(function (L) {
          L = L.filter(function (r) { return r.state === 'open' || (r.state === 'coop' && r.mode === 'coop'); });
          var live = L.filter(function (r) { return r.age < LIVE_MS; });
          if (live.length > 1) throw err('dup', 'código repetido');
          return live[0] || L[0] || null;
        },
          function (e) { if (e.code === 'denied') throw err('off', e.message); throw e; });
      },
      /** Entrar en una sala: solo guest/gname/state; las reglas impiden entrar si ya está llena o si no hay latido. */
      join: function (id, gname) {
        return api.get(id).then(function (r) {
          if (!r || r.age > LIVE_MS) throw err('gone');
          if (r.other) throw err('version');
          if (r.multi) return joinM(r, gname);   // esquema v3: sala de varios
          if (r.state !== 'open' || r.guest) throw err('full');
          var f = { guest: { stringValue: me.uid }, gname: { stringValue: cleanName(gname) || 'Jugador' }, state: { stringValue: 'full' } };
          return call('PATCH', docUrl('rooms/' + id) + '?updateMask.fieldPaths=guest&updateMask.fieldPaths=gname&updateMask.fieldPaths=state&currentDocument.exists=true', { fields: f })
            .then(function (j) { return room(j); }, function (e) {
              if (e.code === 'denied' || e.code === 'gone') return api.get(id).then(function (r2) { throw err(!r2 || r2.age > LIVE_MS ? 'gone' : r2.guest && r2.guest !== me.uid ? 'full' : 'denied', e.message); }, function () { throw err('denied', e.message); });
              throw e;
            });
        });
      },
      /** Esquema v3: sentarse en una sala de varios (solo seats.<tu uid> = {n, at: hora del servidor}). */
      joinMulti: function (id, gname) {
        return api.get(id).then(function (r) {
          if (!r || r.age > LIVE_MS) throw err('gone');
          if (r.other) throw err('version');
          if (!r.multi) throw err('error', 'no es una sala de varios');
          return joinM(r, gname);
        });
      },
      /** El invitado sale antes de empezar. */
      leave: function (id) {
        if (joinedM[id]) return api.leaveMulti(id);   // esquema v3
        var f = { guest: { stringValue: '' }, gname: { stringValue: '' }, state: { stringValue: 'open' } };
        // primero se borra tu respuesta (lleva tus direcciones de red): que no la herede quien entre después
        return call('DELETE', docUrl('rooms/' + id + '/sig/answer'), null, true).catch(function () { }).then(function () { return call('PATCH', docUrl('rooms/' + id) + '?updateMask.fieldPaths=guest&updateMask.fieldPaths=gname&updateMask.fieldPaths=state&currentDocument.exists=true', { fields: f }); }).then(function () { }, function () { });
      },
      /** Esquema v3: te levantas de una sala de varios antes de empezar (primero se borra tu respuesta: lleva tus direcciones de red). */
      leaveMulti: function (id) {
        delete joinedM[id];
        return Promise.resolve(me || auth()).then(function (a) {
          me = me || a;
          return call('DELETE', docUrl('rooms/' + id + '/sig/a_' + me.uid), null, true).catch(function () { }).then(function () {
            return call('PATCH', docUrl('rooms/' + id) + '?updateMask.fieldPaths=' + encodeURIComponent(seatPath(me.uid)) + '&currentDocument.exists=true', { fields: {} });
          });
        }).then(function () { }, function () { });
      },
      /** Esquema v3: el anfitrión levanta a un invitado de su sala (y late). null si la sala ya no existe. */
      kick: function (uid) {
        if (!mine || !me || !uid) return Promise.resolve(null);
        known[uid] = 1; pairsSave();
        // (en la misma escritura, ban.<uid> = true: las reglas no le dejan volver a sentarse en esta sala; la sala nueva empieza sin ban)
        var ban = mine.ban && typeof mine.ban === 'object' ? mine.ban : {}, f = {}, mask = [seatPath(uid)];
        if (!ban[uid] && Object.keys(ban).length < BAN_MAX) { f.ban = {}; f.ban[uid] = true; mask.push(banPath(uid)); }
        var gone = function (e) {
          if (e.code === 'gone' || e.code === 'conflict' || /NOT_FOUND|no entity/i.test(e.message)) { mine = null; return null; }
          throw e;
        };
        return commitRoom(me.uid, f, mask, true).then(function () {
          if (f.ban && mine) { mine.ban = mine.ban || {}; mine.ban[uid] = true; }
          return api.get(me.uid);
        }, function (e) {
          // (reglas de antes del ban: sin él, solo levantarle)
          if (e.code === 'denied' && f.ban) return commitRoom(me.uid, {}, [seatPath(uid)], true).then(function () { return api.get(me.uid); }, gone);
          return gone(e);
        });
      },
      /** 1v1: el anfitrión devuelve su sala a 'open' sin invitado (js/report.js: alguien que tiene bloqueado ha entrado). null si ya no existe. */
      unguest: function () {
        if (!mine || !me) return Promise.resolve(null);
        return commitRoom(me.uid, { guest: '', gname: '', state: 'open' }, ['guest', 'gname', 'state'], true).then(function () { mine.guest = ''; mine.gname = ''; mine.state = 'open'; return api.get(me.uid); },
          function (e) { if (e.code === 'gone' || e.code === 'conflict' || /NOT_FOUND|no entity/i.test(e.message)) { mine = null; return null; } throw e; });
      },
      /** Al cerrar o recargar la pestaña (pagehide): lo mismo que close() (anfitrión) o leave(id) (invitado), sin esperar respuesta
       *  (fetch keepalive con el último token: no hay tiempo de renovarlo). Si el token ya no vale, la sala caduca sola (LIVE_MS). */
      bye: function (role, id, multi) {
        if (!me || !F) return;
        if (multi && id) joinedM[id] = 1;   // (esquema v3: el lobby que retomó una plaza tras recargar lo dice aquí)
        var h = { Authorization: 'Bearer ' + me.token }, ka = function (m, u, b) {
          try { var o = { method: m, headers: h, keepalive: true }; if (b) { o.headers = { Authorization: h.Authorization, 'Content-Type': 'application/json' }; o.body = JSON.stringify(b); } F(u, o).catch(function () { }); } catch (e) { }
        };
        if (role === 'host') {
          mine = null;
          // (esquema v3: las o_/a_ de los invitados que se han visto en tu sala)
          for (var u in known) { ka('DELETE', docUrl('rooms/' + me.uid + '/sig/o_' + u)); ka('DELETE', docUrl('rooms/' + me.uid + '/sig/a_' + u)); }
          known = {};
          ka('DELETE', docUrl('rooms/' + me.uid + '/sig/offer')); ka('DELETE', docUrl('rooms/' + me.uid + '/sig/answer')); ka('DELETE', docUrl('rooms/' + me.uid));
        } else if (role === 'guest' && id && joinedM[id]) {
          // esquema v3: tu respuesta fuera y tu plaza libre (en 'play' las reglas no dejan levantarse: la plaza sigue para la vuelta)
          delete joinedM[id];
          ka('DELETE', docUrl('rooms/' + id + '/sig/a_' + me.uid));
          ka('PATCH', docUrl('rooms/' + id) + '?updateMask.fieldPaths=' + encodeURIComponent(seatPath(me.uid)) + '&currentDocument.exists=true', { fields: {} });
        } else if (role === 'guest' && id) {
          ka('DELETE', docUrl('rooms/' + id + '/sig/answer'));
          ka('PATCH', docUrl('rooms/' + id) + '?updateMask.fieldPaths=guest&updateMask.fieldPaths=gname&updateMask.fieldPaths=state&currentDocument.exists=true',
            { fields: { guest: { stringValue: '' }, gname: { stringValue: '' }, state: { stringValue: 'open' } } });
        }
      },
      /** Fase 6: el anfitrión vuelve tras recargar y retoma su sala (la que dejó en 'full'/'play'): latido y señalización como antes. */
      resume: function () {
        return Promise.resolve().then(function () { return auth(); }).catch(function (e) { throw err('auth', e && e.message); }).then(function (a) {
          me = a;
          return api.get(a.uid).then(function (r) {
            if (!r || r.host !== a.uid) return null;
            var d = {}; for (var i = 0; i < ROOM_KEYS.length; i++) if (r[ROOM_KEYS[i]] !== undefined) d[ROOM_KEYS[i]] = r[ROOM_KEYS[i]];
            mine = d; return r;
          });
        });
      },
      /** El anfitrión cierra su sala (señalización y sala). */
      close: function () {
        if (!me) return Promise.resolve();
        var id = me.uid, wasM = !!(mine && mine.cap); mine = null;
        // (esquema v3: en una sala de varios se lee antes quién está sentado para borrar también su señalización por pareja)
        var pairs = function () {
          var u = Object.keys(known); known = {};
          return (wasM ? api.get(id).then(function (r) { seatUids(r).forEach(function (x) { if (u.indexOf(x) < 0) u.push(x); }); }, function () { }) : Promise.resolve())
            .then(function () { known = {}; pairsRead(id).forEach(function (x) { if (u.indexOf(x) < 0) u.push(x); }); return delPairs(id, u).then(function () { pairsClear(id, u); }); });
        };
        return Promise.all([api.delSig(id), pairs()]).then(function () { return call('DELETE', docUrl('rooms/' + id), null, true); }).then(function () { }, function () { });
      },
      /** offer: s = {sdp, gen, to: uid del invitado al que va} · answer: s = {sdp, gen} (se firma con tu uid). Las reglas solo dejan leer
       *  la oferta a su destinatario (y al anfitrión) y la respuesta a quien la escribió (y al anfitrión mientras sea su invitado).
       *  Esquema v3: con peer (uid del INVITADO de la pareja) va a sig/o_<peer> o sig/a_<peer> = {sdp, gen} (sin to/uid: van en el nombre). */
      putSig: function (id, kind, s, peer) {
        var f = { sdp: { stringValue: String(s.sdp || '') }, gen: { integerValue: String(s.gen | 0) } };
        return Promise.resolve(me || auth()).then(function (a) {
          me = me || a;
          if (peer) return call('PATCH', docUrl('rooms/' + id + '/sig/' + pairDoc(kind, peer)), { fields: f });
          if (kind === 'answer') f.uid = { stringValue: String(me.uid) }; else f.to = { stringValue: String(s.to || '') };
          return call('PATCH', docUrl('rooms/' + id + '/sig/' + (kind === 'answer' ? 'answer' : 'offer')), { fields: f });
        }).then(function () { });
      },
      /** → {sdp, gen, to|uid} o null (no hay, o no es para ti: las reglas responden 403 y aquí cuenta como «no hay»).
       *  Con peer (esquema v3): la de esa pareja; to (oferta) / uid (respuesta) = peer. */
      getSig: function (id, kind, peer) {
        return call('GET', docUrl('rooms/' + id + '/sig/' + (peer ? pairDoc(kind, peer) : kind === 'answer' ? 'answer' : 'offer')), null, true).then(function (j) {
          if (!j || !j.fields) return null; var d = dec(j.fields);
          if (peer) { d.to = kind === 'answer' ? '' : peer; d.uid = kind === 'answer' ? peer : ''; }
          return { sdp: String(d.sdp || ''), gen: d.gen | 0, to: String(d.to || ''), uid: String(d.uid || '') };
        }, function (e) { if (e.code === 'denied') return null; throw e; });
      },
      /** Sin peers: los documentos 1v1 (offer y answer). Con peers (uid o lista de uids de invitados, esquema v3): sus o_ y a_. */
      delSig: function (id, peers) {
        if (peers) return delPairs(id, Array.isArray(peers) ? peers : [peers]);
        return Promise.all(['offer', 'answer'].map(function (k) { return call('DELETE', docUrl('rooms/' + id + '/sig/' + k), null, true).catch(function () { }); })).then(function () { });
      },
      _mine: function () { return mine; }
    };
    return api;
  }

  VB.NetRoom = { create: create, newCode: newCode, codeOk: codeOk, normCode: normCode, cleanName: cleanName, enc: enc, dec: dec, ALPHA: ALPHA,
    LIVE_MS: LIVE_MS, STALE_MS: STALE_MS, BEAT_MS: BEAT_MS, CAPS: CAPS, multiCfg: multiCfg, seatPath: seatPath, joinable: joinable };
})();
