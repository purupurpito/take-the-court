/* =====================================================================
 * VOLEY 3D — js/netlobby.js   (owner: net)
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
  var NICK = 'voley3d.nick', PREFS = 'voley3d.netroom', HELPK = 'voley3d.nethelp';   // (nethelp = '1': ya vio «Cómo funciona»)
  var CONNECT_MS = 30000, OFFER_MS = 10000, OFFER_MAX = 65000, PRE_MS = 12000, LIST_EVERY = 8000, ROOM_POLL = 2000, SIG_POLL = 1000;   // (lecturas de Firestore: ver notes/net.md «Cuotas»)

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } return null; }
  function jls(k) { try { return JSON.parse(ls(k) || 'null'); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function NR() { return VB.NetRoom; }
  function ctx() { return VB.ctx || null; }
  function ver() { return (VB.Net ? VB.Net.PROTO : 0) + '|' + (VB.VERSION || ''); }
  function sound(k) { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui(k); } catch (e) { } }

  /* ---------------- cuenta y backend ---------------- */
  function b64u(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
  function emuToken(uid) {
    var t = Math.floor(Date.now() / 1000);
    return b64u({ alg: 'none', typ: 'JWT' }) + '.' + b64u({ iss: 'https://securetoken.google.com/demo-mtc', aud: 'demo-mtc', auth_time: t, user_id: uid, sub: uid, iat: t, exp: t + 3600, firebase: { identities: {}, sign_in_provider: 'password' } }) + '.';
  }
  function signedIn() { if (EMU) return true; var A = VB.Account; return !!(A && A.user && A.user() && A.netAuth); }
  /** Quién hay en la cuenta ('' si nadie): solo se reacciona cuando cambia (entrar, salir, cambiar de cuenta), no en cada sincronización. */
  function accKey() { if (!signedIn()) return ''; var A = VB.Account, i = A && A.netInfo && A.netInfo(); return (i && i.uid) || (A && A.user && A.user()) || '1'; }
  /** Sin WebRTC no se puede jugar ni abrir salas (p. ej. iOS en modo Aislamiento). */
  function noRtc() { return !VB.NetRtc || !VB.NetRtc.supported(); }
  var rooms = null, roomsKey = '';
  function api() {
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

  /* ---------------- nombre visible y atributos ---------------- */
  function careerPlayer() {
    var C = VB.Career; if (!C) return null;
    try { var m = C.mode ? C.mode() : 'beach', E = C[m === 'hall' ? 'hall' : 'beach'], c = E && E.get ? E.get() : null; return c && c.player ? c.player : null; } catch (e) { return null; }
  }
  function defaultName() {
    var p = careerPlayer(), n = p && NR().cleanName(p.name);
    if (n) return n;
    var inf = !EMU && VB.Account && VB.Account.netInfo ? VB.Account.netInfo() : null;
    if (inf && inf.kind === 'user' && NR().cleanName(inf.user)) return NR().cleanName(inf.user);
    var uid = inf ? inf.uid : String(Q.netuid || 'x'), h = 0; for (var i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return 'Jugador ' + (1000 + h % 9000);
  }
  function myName() { if (EMU && Q.name) return NR().cleanName(Q.name) || 'Jugador'; return NR().cleanName(ls(NICK)) || defaultName(); }
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
    return [kind].concat(vn && vn !== kind ? [vn] : [], [r.bo === 3 ? 'Mejor de 3' : '1 set a ' + (r.pts || 21), r.even ? 'Igualado' : 'Con sus atributos']);
  }
  function sep(parts) { return parts.map(esc).join('<i class="ol-sep" aria-hidden="true"></i>'); }

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
    return { venue: p.venue === 'beach' ? 'beach' : 'hall', mapH: String(p.mapH || ''), mapB: String(p.mapB || ''), bo: +p.bo === 3 ? 3 : 1, even: !!p.even };
  }
  function savePrefs(c) { try { ls(PREFS, JSON.stringify(c)); } catch (e) { } }
  function maps(kind) { var V = VB.Venues; var l = V && V.list ? safe(function () { return V.list(kind); }) : null; return Array.isArray(l) && l.length ? l : ['']; }

  function errText(e, what) {
    var c = e && e.code;
    if (c === 'off') return 'El online aún no está activado en el servidor. Vuelve a probar en un rato.';
    if (c === 'auth') return 'Tu sesión ha caducado: vuelve a entrar en tu cuenta.';
    if (c === 'net') return 'No hay conexión con el servidor. Comprueba tu red y vuelve a probar.';
    if (c === 'full') return 'Esa sala ya está llena.';
    if (c === 'gone') return 'Esa sala ya no existe.';
    if (c === 'version') return 'Esa sala es de otra versión del juego: recargad la página los dos.';
    return what || 'Algo ha fallado. Vuelve a probar.';
  }

  /* ---------------- lista ---------------- */
  function refreshList(manual) {
    if (!L.on || L.view !== 'list' || L.loading) return;
    if (!signedIn()) { setView('noacc'); return; }
    L.loading = true; if (manual) render();
    api().list().then(function (rs) {
      L.loading = false; L.rooms = rs; L.listAt = Date.now(); L.listErr = '';
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
    L.view = v; L.edit = '';
    stop('list');
    if (v === 'list') { every('list', LIST_EVERY, function () { if (document.visibilityState !== 'hidden') refreshList(false); }); }
    render(true);
  }

  /* ---------------- crear sala (anfitrión) ---------------- */
  function createRoom() {
    if (noRtc()) { setView('nortc'); return; }   // (revisión F4: sin WebRTC nunca se abre ni se ocupa una sala)
    var c = L.cfg; savePrefs(c);
    var map = c.venue === 'beach' ? c.mapB : c.mapH;
    L.msg = ''; L.busy = true; render();
    api().open({ name: myName(), venue: c.venue, map: map, bo: c.bo, even: c.even, pts: 21 }).then(function (r) {
      L.busy = false;
      if (!r) throw { code: 'error' };
      L.room = r; L.role = 'host'; L.rival = ''; L.fail = ''; L.started = false; L.status = 'wait';
      setView('room');
      every('beat', NR().BEAT_MS, hostBeat);
      every('poll', ROOM_POLL, hostPoll);
    }).catch(function (e) {
      L.busy = false;
      if (e && e.code === 'off') { setView('off'); return; }
      L.msg = errText(e, 'No se ha podido crear la sala.'); L.msgBad = true; render();
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
      if (r.guest && r.state === 'full' && (!L.conn || L.conn.guest !== r.guest)) hostConnect(r);
      else if (!r.guest && L.conn) { abortConn(); api().delSig(L.room.id).catch(function () { }); L.rival = ''; L.status = 'wait'; L.fail = (L.fail || ''); render(); }
      else render();
    }, function () { });
  }
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
    L.rival = NR().cleanName(r.gname) || 'Rival'; L.status = 'connecting'; L.fail = ''; render();
    sound('click');
    var link = newLink(), id = L.room.id;
    link.offer().then(function (sdp) {
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
  function connFail() {
    var who = L.rival || 'tu rival';
    L.fail = 'No se ha podido conectar directamente con ' + who + ': vuestras redes no lo permiten. Probad otra vez o desde otra red.';
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
      L.room = r; L.role = 'guest'; L.rival = NR().cleanName(r.name) || 'Rival'; L.status = 'connecting'; L.fail = ''; L.started = false;
      setView('room'); sound('click');
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
        link.answer(o.sdp).then(function (sdp) { return api().putSig(id, 'answer', { sdp: sdp, gen: o.gen }); }).catch(function () { });
      }, function () { });
    });
  }
  function noHost() {
    var id = L.room && L.room.id, who = L.rival || 'Quien creó la sala';
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
      if (!r || (r.guest && r.guest !== api().uid()) || (!r.guest && r.state === 'open')) roomGone(L.fail || 'Quien creó la sala la ha cerrado.');
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
    if (L.role === 'guest') link.send('ctl', JSON.stringify({ k: 'pre', name: me, st: { attrs: st.attrs, badges: st.badges }, look: myLook() }));
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
  function begin(pre, st) {
    var C = ctx(); if (!C || !C.actions || !C.actions.startOnline) { connFail(); return; }
    var r = L.room, opts = null, rivalName = NR().cleanName(pre.name) || L.rival || 'Rival';
    L.rival = rivalName;
    if (L.role === 'host') {
      var gst = pre.st || {}, even = !!r.even;
      var seed = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] >>> 1 : Math.floor(Math.random() * 2147483647);
      opts = { online: true, seed: seed, venue: r.venue === 'beach' ? 'beach' : 'hall', mapId: r.map || '', bestOf: r.bo === 3 ? 3 : 1, points: r.pts || 21, even: even,
        present: true, stats: true,
        humans: [even ? {} : { attrs: st.attrs || undefined, badges: st.badges || undefined }, even ? {} : { attrs: sanAttrs(gst.attrs) || undefined, badges: sanBadges(gst.badges) || undefined }] };
      L.link.send('ctl', JSON.stringify({ k: 'pre', name: myName(), look: myLook() }));
      api().beat({ state: 'play' }).catch(function () { });
      api().delSig(r.id).catch(function () { });
    }
    stopAll(L.role === 'host' ? ['beat'] : []);
    L.started = true; L.status = 'play';
    var link = L.link;
    link.onclose = function () { matchClosed(link); };
    var ok = C.actions.startOnline({ slot: L.role === 'host' ? 0 : 1, link: link, opts: opts, name: myName(), rivalName: rivalName,
      look: { mine: myLook(), theirs: saneLook(pre.look) } });
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
      link.offer().then(function (sdp) { return api().putSig(id, 'offer', { sdp: sdp, gen: gen, to: to }); }).then(function () {
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
    var id = L.room && L.room.id, role = L.role;
    abortConn(); stopAll(); L.room = null; L.role = ''; L.rival = ''; L.status = ''; L.fail = '';
    if (role === 'host') api().close(); else if (role === 'guest' && id) api().leave(id);
  }

  /* ---------------- pintado ---------------- */
  var CSS = '#mpOnline{width:min(640px,100%)}' +
    '#mpOnline .ol-body{display:flex;flex-direction:column;gap:12px;min-height:0}' +
    '#mpOnline .qlist .mi{height:58px;grid-template-columns:minmax(0,1fr) auto;padding-right:12px}' +
    '#mpOnline .qlist .mi.primary{height:64px}' +
    '#mpOnline .mi-l{font-size:21px;min-width:0}#mpOnline .mi.primary .mi-l{font-size:28px}' +
    '#mpOnline .ol-r{display:flex;align-items:center;gap:8px;font:700 14px/1.1 var(--ui);letter-spacing:.01em;text-transform:none;color:var(--soft);white-space:nowrap}' +
    '#mpOnline .ol-r b{font:800 17px/1 var(--display);letter-spacing:.06em;color:#ffd23f}' +
    '#mpOnline .ol-sep{display:inline-block;width:1px;height:.9em;margin:0 .5em;vertical-align:-.1em;background:currentColor;opacity:.45}' +
    '#mpOnline .ol-h{display:flex;align-items:baseline;justify-content:space-between;margin:6px 2px 0;font:800 15px var(--display);letter-spacing:.12em;text-transform:uppercase;color:var(--fg2);text-shadow:var(--ring1)}' +
    '#mpOnline .ol-h small{font:600 12px var(--ui);letter-spacing:.02em;text-transform:none;color:var(--muted)}' +
    '#mpOnline .ol-rooms{max-height:min(38vh,320px);overflow:auto;padding:2px;margin:-2px;scrollbar-width:thin}' +
    '#mpOnline .ol-empty,#mpOnline .ol-note{margin:0;padding:12px 14px;border-radius:12px;background:rgba(10,16,30,.5);box-shadow:inset 0 0 0 1px var(--line);font:600 14px/1.4 var(--ui);color:var(--soft)}' +
    '#mpOnline .ol-note.bad{box-shadow:inset 0 0 0 2px rgba(255,106,46,.75);color:#ffe2d3}' +
    '#mpOnline .ol-card{padding:16px 18px;border-radius:14px;background:rgba(10,16,30,.62);box-shadow:inset 0 0 0 1px var(--line)}' +
    '#mpOnline .ol-card h3{margin:0 0 6px;font:800 24px var(--display);letter-spacing:.04em;color:#fff}' +
    '#mpOnline .ol-card p{margin:0;font:600 14px/1.45 var(--ui);color:var(--soft)}' +
    '#mpOnline .ol-edit{display:flex;gap:8px;align-items:center}' +
    '#mpOnline .ol-edit input{flex:1;min-width:0;height:52px;padding:0 14px;border-radius:12px;border:0;background:rgba(5,9,18,.85);box-shadow:inset 0 0 0 2px #ff7a3e;color:#fff;font:700 20px var(--ui);outline:none}' +
    '#mpOnline .ol-edit input.code{letter-spacing:.3em;text-transform:uppercase;font-family:var(--display)}' +
    '#mpOnline .ol-edit .mi{width:auto;padding:0 18px}' +
    '#mpOnline .ol-vs{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:12px;margin:12px 0 10px}' +
    '#mpOnline .ol-p{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0;text-align:center}' +
    '#mpOnline .ol-p b{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:800 24px var(--display);letter-spacing:.04em;color:#fff}' +
    '#mpOnline .ol-p small{font:700 12px var(--ui);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}' +
    '#mpOnline .ol-p .ar{font-size:12px;line-height:1;color:#ffd23f}#mpOnline .ol-p.wait b{color:var(--muted);font-size:18px}' +
    '#mpOnline .ol-mid{font:800 18px var(--display);color:var(--muted);padding-bottom:18px}' +
    '#mpOnline .ol-code{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,.1);font:800 16px var(--display);letter-spacing:.24em;color:#ffd23f}' +
    '#mpOnline .ol-st{margin-top:8px;font:700 14px/1.4 var(--ui);color:#ffe9a8}#mpOnline .ol-st.bad{color:#ffb39a}' +
    '#mpOnline .ol-card p.ol-tip{margin-top:8px;font:600 13px/1.4 var(--ui);color:var(--muted)}' +
    '#mpOnline .ol-help dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:7px 14px;margin:8px 0 0}' +
    '#mpOnline .ol-help dt{font:800 13px/1.45 var(--display);letter-spacing:.08em;text-transform:uppercase;color:#ffd23f;white-space:nowrap}' +
    '#mpOnline .ol-help dd{margin:0;font:600 14px/1.4 var(--ui);color:var(--soft)}' +
    '@media (max-height:420px){#mpOnline .qlist .mi{height:44px}#mpOnline .mi-l{font-size:17px}#mpOnline .mi-h{display:none}#mpOnline .qlist .mi.primary{height:48px}' +
    '#mpOnline .mi.primary .mi-l{font-size:22px}#mpOnline .ol-rooms{max-height:30vh}#mpOnline .ol-card{padding:10px 12px}#mpOnline .ol-vs{margin:6px 0 4px}' +
    '#mpOnline .ol-card h3{font-size:19px;margin-bottom:2px}#mpOnline .ol-help dl{gap:3px 10px;margin-top:4px}#mpOnline .ol-help dt{font-size:11.5px;line-height:1.35}' +
    '#mpOnline .ol-help dd{font-size:12px;line-height:1.3}#mpOnline .ol-card p.ol-tip{display:none}' +
    // (fase 4) teléfono apaisado: el ancho de las demás páginas (el botón «Pantalla completa» no tapa nada) y las filas de sala con su
    // sede y partido a la vista (decisión 1: la lista dice formato, sede y configuración)
    '#mpOnline{width:min(560px,100%)}#mpOnline .ol-rooms .mi{height:52px}#mpOnline .ol-rooms .mi-h{display:block;font-size:11px;margin-top:2px}}' +
    '@media (min-width:621px){#mpPlay .modes.has-onl{grid-template-columns:repeat(5,minmax(0,1fr))}}' +
    '#menu .m-onl .md-art{background:#3d5bd9}';
  function ensureCss() { if (document.getElementById('olCss')) return; var s = document.createElement('style'); s.id = 'olCss'; s.textContent = CSS; document.head.appendChild(s); }
  ensureCss();   // (ya al cargar: la tarjeta de Jugar usa .has-onl / .m-onl antes de abrir el lobby)

  function row(a, label, help, right, extra) {
    return '<button class="mi' + (extra && extra.primary ? ' primary' : '') + '" data-a="' + a + '"' + (extra && extra.id ? ' data-id="' + esc(extra.id) + '"' : '') +
      (extra && extra.dis ? ' disabled' : '') + (extra && extra.aria ? ' aria-label="' + esc(extra.aria) + '"' : '') + '>' +
      '<span class="mi-l">' + label + (help ? '<small class="mi-h">' + help + '</small>' : '') + '</span>' + (right ? '<span class="ol-r">' + right + '</span>' : '') + '</button>';
  }
  var ARR_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>', ARR_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';
  function optRow(k, label, help, val) {
    return '<button class="mi" data-ol="' + k + '" aria-label="' + esc(label + ': ' + val) + '"><span class="mi-l">' + esc(label) + '<small class="mi-h">' + esc(help) + '</small></span>' +
      '<span class="mi-v"><span class="arr" data-d="-1">' + ARR_L + '</span><span class="mv-val"><b>' + esc(val) + '</b></span><span class="arr" data-d="1">' + ARR_R + '</span></span></button>';
  }
  /* Fase 4: «Cómo funciona» (sale sola la primera vez que se entra en la lista; luego, desde la fila de la lista). Frases cortas,
   * género neutro (notes/ui_main.md «Textos: guía de estilo»). */
  var HELP = [
    ['1 contra 1', 'Cada persona lleva a su n.º 1 y la IA lleva a su pareja. Es 2 contra 2 en la playa o en pista.'],
    ['Tu jugador', 'Juegas con los atributos e insignias de tu jugador de la Carrera (sin Carrera, los de tu n.º 1 de Partido rápido). En una sala «Igualado», nadie lleva atributos ni insignias.'],
    ['Salas', 'Crea una sala y espera a que alguien entre desde la lista, o entra en una sala abierta. También puedes pasar el código de tu sala.'],
    ['Sin pausa', 'No se puede parar el partido. Entre sets hay 10 s de descanso: si tu rival y tú pulsáis «Continuar», se sigue antes.'],
    ['Si se corta', 'El partido espera a tu rival y a los 10 s puedes seguir contra la IA. Tiene 60 s para volver.'],
    ['Récord', 'Abandonar cuenta como derrota. El online no da experiencia ni insignias; al terminar tu primer partido, la gorra «Online Beta Tester» para el Vestuario.'],
    ['Privacidad', 'Tu rival solo ve tu nombre. Nunca tu correo ni tu dirección de red.']
  ];
  function helpHTML() {
    return '<div class="ol-card ol-help"><h3>Cómo funciona el online</h3><dl>' + HELP.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl></div>';
  }
  function note() { return L.msg ? '<p class="ol-note' + (L.msgBad ? ' bad' : '') + '" role="status">' + esc(L.msg) + '</p>' : ''; }
  function viewHTML() {
    var v = L.view, h = '';
    if (v === 'noacc') {
      h = '<div class="ol-card"><h3>Necesitas una cuenta para jugar online</h3><p>Entra con tu cuenta (o créala, es gratis) y vuelve aquí. Tu rival solo verá tu nombre.</p></div>' +
        '<div class="qlist" data-nav>' + row('acc', 'Ir a Cuenta', 'Entrar o crear una cuenta', '', { primary: true }) + '</div>';
    } else if (v === 'off') {
      h = '<div class="ol-card"><h3>El online aún no está activado en el servidor</h3><p>Todavía no se puede jugar online. Vuelve a probar dentro de un rato.</p></div>' +
        '<div class="qlist" data-nav>' + row('retry', 'Volver a probar', '', '', { primary: true }) + '</div>';
    } else if (v === 'nortc') {
      h = '<div class="ol-card"><h3>Este navegador no puede jugar online</h3><p>Prueba con una versión reciente de Chrome, Edge, Firefox o Safari (en el iPhone, sin el modo Aislamiento).</p></div>';
    } else if (v === 'help') {
      h = helpHTML() + '<div class="qlist" data-nav>' + row('helpOk', 'Entendido', '', '', { primary: true }) + '</div>';
    } else if (v === 'list') {
      var nm = myName();
      h = note() + '<div class="qlist" data-nav>' + row('new', 'Crear sala', 'Eliges sede y partido, y alguien entra desde la lista', '', { primary: true, dis: L.busy });
      if (L.edit === 'name') h += '<div class="ol-edit"><input id="olIn" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Tu nombre en el online" value="' + esc(nm) + '"><button class="mi" data-a="nameOk">Guardar</button></div>';
      else h += row('name', 'Tu nombre', 'Lo único que ve tu rival', '<b>' + esc(nm) + '</b>', { aria: 'Tu nombre: ' + nm + '. Cambiar' });
      // (fase 3: tu récord online, aparte del de Partido rápido; abandonar cuenta como derrota)
      var rl = VB.NetRec ? safe(function () { return VB.NetRec.line(); }) : '';
      if (rl) h += '<p class="ol-empty ol-rec">Tu récord online: <b>' + esc(rl) + '</b></p>';
      if (L.edit === 'code') h += '<div class="ol-edit"><input id="olIn" class="code" maxlength="7" autocomplete="off" spellcheck="false" aria-label="Código de la sala" placeholder="K7P2QX"><button class="mi" data-a="codeOk">Entrar</button></div>';
      else h += row('code', 'Entrar con código', 'Si te han pasado el código de una sala', '');
      h += '</div><h3 class="ol-h">Salas abiertas<small>' + (L.loading && !L.listAt ? 'Buscando…' : L.listAt ? (L.rooms.length === 1 ? '1 sala' : L.rooms.length + ' salas') : '') + '</small></h3>';
      if (L.listErr) h += '<p class="ol-note bad">' + esc(L.listErr) + '</p>';
      h += '<div class="qlist ol-rooms" data-nav>';
      if (!L.rooms.length) h += L.listAt ? '<p class="ol-empty">No hay salas abiertas ahora mismo. Crea una y aparecerá aquí para los demás.</p>' : '';
      L.rooms.forEach(function (r) {
        var parts = cfgParts(r);
        h += row('join', esc(r.name), sep(parts), r.other ? 'Otra versión' : '<b>1/2</b>', { id: r.id, dis: r.other || L.busy, aria: 'Sala de ' + r.name + '. ' + parts.join(', ') + (r.other ? '. Otra versión del juego' : '. Una plaza libre') });
      });
      h += '</div><div class="qlist" data-nav>' + row('refresh', 'Actualizar', '', '') + row('help', 'Cómo funciona', 'Partido, reglas y récord del online', '') + '</div>';
    } else if (v === 'create') {
      var c = L.cfg, ms = maps(c.venue), cur = c.venue === 'beach' ? c.mapB : c.mapH;
      if (ms.indexOf(cur) < 0) { cur = ms[0]; if (c.venue === 'beach') c.mapB = cur; else c.mapH = cur; }
      var vn = cur && VB.Venues && VB.Venues.name ? VB.Venues.name(cur) || cur : (c.venue === 'beach' ? 'Playa' : 'Pabellón');
      h = note() + '<div class="qlist" data-nav>' +
        optRow('venue', 'Escenario', c.venue === 'beach' ? '2 contra 2 en la arena' : '2 contra 2 en pista cubierta', c.venue === 'beach' ? 'Playa' : 'Pabellón') +
        optRow('map', 'Sede', 'Donde se juega el partido', vn) +
        optRow('bo', 'Partido', c.bo === 3 ? 'Sets a 21; el tercero, a 15' : 'Un set a 21 puntos', c.bo === 3 ? 'Mejor de 3' : '1 set') +
        optRow('even', 'Atributos', c.even ? 'Todos neutros y sin insignias' : 'Cada uno con los de su jugador de la Carrera', c.even ? 'Igualado' : 'Los suyos') +
        row('open', 'Abrir sala', 'Saldrá en la lista de Online', '', { primary: true, dis: L.busy }) + '</div>';
    } else if (v === 'room' && L.room) {
      var r2 = L.room, host = L.role === 'host', me = myName(), riv = L.rival;
      var st = '', bad = false;
      if (L.started) st = 'Empieza el partido…';
      else if (L.status === 'wait') st = L.fail || 'Esperando rival. Tu sala sale en la lista de Online.';
      else if (L.status === 'connecting') st = 'Conectando con ' + riv + '…';
      else if (L.status === 'linked') st = 'Conectados. Empieza el partido…';
      bad = !!L.fail && L.status === 'wait';
      var left = host ? me : riv, right = host ? (riv || '') : me;
      var pl = function (n, who, isRival) {
        if (!n) return '<div class="ol-p wait"><span class="ar" aria-hidden="true">&nbsp;</span><b>Esperando…</b><small>' + who + '</small></div>';
        return '<div class="ol-p">' + (isRival ? '<span class="ar" aria-hidden="true">▼</span>' : '<span class="ar" aria-hidden="true">&nbsp;</span>') + '<b>' + esc(n) + '</b><small>' + who + '</small></div>';
      };
      h = '<div class="ol-card"><p>' + (host ? 'Tu sala' : 'Sala de ' + esc(r2.name)) + ' <span class="ol-code" aria-label="Código ' + esc(r2.code.split('').join(' ')) + '">' + esc(r2.code) + '</span></p>' +
        '<div class="ol-vs">' + pl(left, host ? 'Tú' : 'Rival', !host) + '<span class="ol-mid">—</span>' + pl(right, host ? 'Rival' : 'Tú', host && !!riv) + '</div>' +
        '<p>' + sep(cfgParts(r2)) + '</p><p class="ol-st' + (bad ? ' bad' : '') + '" role="status">' + esc(st) + '</p>' +
        (L.started ? '' : '<p class="ol-tip">Llevas a tu n.º 1 y la IA a tu pareja. No hay pausa durante el juego: entre sets, 10 s de descanso. Abandonar cuenta como derrota.</p>') + '</div>' +
        '<div class="qlist" data-nav>' + (host ? row('copy', 'Copiar código', 'Para pasárselo a alguien', '') : '') + row('leave', 'Salir de la sala', '', '') + '</div>';
    }
    return h;
  }
  var lastH = '';
  function render(force) {
    if (!L.host || !L.on) return;
    var body = L.host.querySelector('.ol-body'); if (!body) return;
    var h = viewHTML();
    if (!force && h === lastH) return;
    var a = document.activeElement, key = a && body.contains(a) ? keyOf(a) : null, kf = a && a.classList && a.classList.contains('kf');
    lastH = h; body.innerHTML = h;
    var inp = body.querySelector('#olIn');
    if (inp) { bindInput(inp); setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { } }, 20); return; }
    if (key) { var b = findKey(body, key) || first(); if (b) { try { b.focus({ preventScroll: !kf }); } catch (e) { } if (kf) b.classList.add('kf'); } }
  }
  function keyOf(b) { return b.getAttribute('data-a') ? b.getAttribute('data-a') + '|' + (b.getAttribute('data-id') || '') : b.getAttribute('data-ol') ? 'ol|' + b.getAttribute('data-ol') : null; }
  function findKey(body, k) {
    var p = k.split('|'), sel = p[0] === 'ol' ? '[data-ol="' + p[1] + '"]' : '[data-a="' + p[0] + '"]' + (p[1] ? '[data-id="' + p[1] + '"]' : '');
    var b = body.querySelector(sel); return b && !b.disabled ? b : null;
  }
  function first() { var b = L.host && L.host.querySelector('.ol-body button:not([disabled])'); return b || null; }
  function bindInput(inp) {
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab') return;   // (navegación del menú)
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
      else if (e.key === 'Escape') { e.preventDefault(); var k = L.edit; L.edit = ''; render(true); focusA(k); }
    });
  }
  function commitEdit() {
    var inp = L.host && L.host.querySelector('#olIn'), v = inp ? inp.value : '', k = L.edit;
    if (k === 'name') {
      var n = NR().cleanName(v);
      if (!n) { L.msg = 'El nombre tiene que tener entre 2 y 16 caracteres (y no puede ser un correo).'; L.msgBad = true; L.edit = ''; render(true); focusA('name'); return; }
      ls(NICK, n); L.msg = ''; L.edit = ''; render(true); focusA('name');
    } else if (k === 'code') { L.edit = ''; render(true); joinCode(v); }
  }
  function focusA(a) { setTimeout(function () { var b = L.host && L.host.querySelector('[data-a="' + a + '"]'); if (b) { try { b.focus(); } catch (e) { } } }, 30); }

  function step(k, d) {
    var c = L.cfg; if (!c) return;
    if (k === 'venue') c.venue = c.venue === 'beach' ? 'hall' : 'beach';
    else if (k === 'map') { var ms = maps(c.venue), cur = c.venue === 'beach' ? c.mapB : c.mapH, i = ms.indexOf(cur); i = (i + (d > 0 ? 1 : -1) + ms.length) % ms.length; if (c.venue === 'beach') c.mapB = ms[i]; else c.mapH = ms[i]; }
    else if (k === 'bo') c.bo = c.bo === 3 ? 1 : 3;
    else if (k === 'even') c.even = !c.even;
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
    else if (a === 'help') { L.msg = ''; setView('help'); setTimeout(function () { var f = first(); if (f) f.focus(); }, 30); }
    else if (a === 'helpOk') { ls(HELPK, '1'); setView('list'); refreshList(false); focusA(L.helpFrom || 'help'); L.helpFrom = ''; }
    else if (a === 'new') { L.cfg = prefs(); L.msg = ''; setView('create'); setTimeout(function () { var f = first(); if (f) f.focus(); }, 30); }
    else if (a === 'open') createRoom();
    else if (a === 'name' || a === 'code') { L.edit = a; L.msg = ''; render(true); }
    else if (a === 'nameOk' || a === 'codeOk') commitEdit();
    else if (a === 'join') joinRoom(b.getAttribute('data-id'));
    else if (a === 'refresh') refreshList(true);
    else if (a === 'leave') { leaveRoom(); L.msg = ''; setView('list'); refreshList(true); focusA('new'); }
    else if (a === 'copy') copyCode();
  }
  function copyCode() {
    var c = L.room && L.room.code; if (!c) return;
    var done = function () { L.fail = ''; var s = L.host.querySelector('.ol-st'); if (s) s.textContent = 'Código copiado: ' + c; };
    try { navigator.clipboard.writeText(c).then(done, done); } catch (e) { done(); }
  }

  /* ---------------- API para ui.js ---------------- */
  function open(host) {
    ensureCss();
    if (!L.host) {
      L.host = host;
      host.addEventListener('click', onClick);
      if (VB.Account && VB.Account.onChange) VB.Account.onChange(function () {
        var k = accKey(), was = L.accKey; L.accKey = k;
        if (k === was || !L.on || L.room || L.view === 'nortc') return;   // (las sincronizaciones también avisan: no echan de «Crear sala» ni cierran «Tu nombre»)
        rooms = null; L.msg = '';
        if (k && !ls(HELPK)) { L.helpFrom = 'new'; setView('help'); return; }
        setView(k ? 'list' : 'noacc'); if (k) refreshList(true);
      });
    }
    if (!host.querySelector('.ol-body')) { var d = document.createElement('div'); d.className = 'ol-body'; host.appendChild(d); }
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
    if (!L.started) { leaveRoom(); stopAll(); L.view = 'list'; L.msg = ''; }
  }
  /** Esc / B dentro del lobby: primero se cierra lo abierto (edición, crear sala, la sala) y solo luego se sale de la página. */
  function back() {
    if (!L.on) return false;
    if (L.edit) { var k = L.edit; L.edit = ''; render(true); focusA(k); return true; }
    if (L.view === 'create') { L.msg = ''; setView('list'); refreshList(false); focusA('new'); return true; }
    if (L.view === 'help') { ls(HELPK, '1'); setView('list'); refreshList(false); focusA(L.helpFrom || 'help'); L.helpFrom = ''; return true; }
    if (L.view === 'room' && !L.started) { leaveRoom(); setView('list'); refreshList(true); focusA('new'); return true; }
    return false;
  }
  function side(el, d) { var k = el && el.getAttribute && el.getAttribute('data-ol'); if (k) { step(k, d); return true; } return false; }

  // Cerrar o recargar la pestaña: la sala (anfitrión) o el hueco (invitado) se liberan al momento, sin esperar a que caduquen.
  // (pagehide también salta al ir a otra página; 'persisted' = la página queda en la caché del navegador y puede volver: entonces
  // también se suelta, y al volver se está en la lista.)
  window.addEventListener('pagehide', function () {
    if (!rooms || !L.room || !L.role) return;
    try { rooms.bye(L.role, L.room.id); } catch (e) { }
    if (L.started) return;   // (en pleno partido la sesión sigue a lo suyo: para el rival es una desconexión normal)
    abortConn(); stopAll(); L.room = null; L.role = ''; L.rival = ''; L.started = false; L.view = 'list';
  });

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
    myName: myName, myStats: myStats, myLook: myLook, saneLook: saneLook,
    _state: function () { return { view: L.view, role: L.role, rival: L.rival, status: L.status, started: L.started, rooms: L.rooms.map(function (r) { return { id: r.id, name: r.name, other: r.other }; }), room: L.room && { id: L.room.id, code: L.room.code, state: L.room.state }, link: L.link && L.link.state, linkInfo: L.link && L.link.info(), msg: L.msg, fail: L.fail, emu: EMU }; },
    _link: function () { return L.link; }
  };
})();
