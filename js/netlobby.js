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
    return [kind].concat(vn && vn !== kind ? [vn] : [], chips(r));
  }
  /** Chips del partido (lista, vista previa de «Crear sala» y sala de espera). (fase 6: puntos por set en Pabellón) */
  function chips(r) {
    var p = r.pts || 21;
    return [r.bo === 3 ? 'Mejor de 3' + (p !== 21 ? ' a ' + p : '') : '1 set a ' + p, r.even ? 'Igualado' : 'Con sus atributos'];
  }
  function chipsHTML(r) { return chips(r).map(function (t) { return '<i>' + esc(t) + '</i>'; }).join(''); }
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
    return { venue: p.venue === 'beach' ? 'beach' : 'hall', mapH: String(p.mapH || ''), mapB: String(p.mapB || ''), bo: +p.bo === 3 ? 3 : 1, even: !!p.even, pts: [11, 15, 21, 25].indexOf(+p.pts) >= 0 ? +p.pts : 21 };
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
    L.view = v; L.edit = ''; L.osk = null;
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
    api().open({ name: myName(), venue: c.venue, map: map, bo: c.bo, even: c.even, pts: c.venue === 'beach' ? 21 : c.pts }).then(function (r) {
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
    // ---- rediseño 1.5.x: barra de acciones, cartelera de salas (rótulo de TV), sala de espera y teclado en pantalla ----
    '#mpOnline .ol-bar{display:flex;gap:8px;align-items:stretch;flex:none}' +
    '#mpOnline .ol-act{display:flex;align-items:center;justify-content:center;gap:7px;height:46px;padding:0 15px;margin:0;border-radius:10px;font:800 16px/1 var(--display);letter-spacing:.08em;' +
    'text-transform:uppercase;white-space:nowrap;color:var(--fg);background:var(--cel-a);box-shadow:inset 0 0 0 2.5px var(--tk),3px 4px 0 var(--tk);text-shadow:var(--ring1)}' +
    '#mpOnline .ol-act svg{flex:none;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}' +
    '#mpOnline .ol-act:hover{background:var(--cel-hi)}' +
    '#mpOnline .ol-act:focus-visible,#mpOnline .ol-act.kf{background:var(--cel-hi);box-shadow:inset 0 0 0 2.5px var(--tk),inset 0 0 0 5px #ffb238,3px 4px 0 var(--tk);outline:none}' +
    '#mpOnline .ol-act.ol-new{background:var(--pri);color:#fff;padding:0 18px;font-size:18px}#mpOnline .ol-act.ol-new:hover{background:var(--pri-hi)}' +
    '#mpOnline .ol-act.ol-new:focus-visible,#mpOnline .ol-act.ol-new.kf{background:var(--pri-hi);box-shadow:inset 0 0 0 2.5px var(--tk),inset 0 0 0 5px #fff,3px 4px 0 var(--tk)}' +
    '#mpOnline .ol-act.ol-nm{flex:1 1 auto;min-width:0;justify-content:flex-start}' +
    '#mpOnline .ol-me{min-width:0;overflow:hidden;text-overflow:ellipsis;text-transform:none;letter-spacing:.02em;font-size:18px;color:#ffd23f}' +
    '#mpOnline .ol-act.ol-ico{width:46px;padding:0;flex:none}#mpOnline .ol-q{font:900 22px/1 var(--display)}' +
    '#mpOnline .ol-act.spin svg{animation:olSpin .8s linear infinite}@keyframes olSpin{to{transform:rotate(360deg)}}' +
    '#mpOnline .ol-bar2 .ol-act{flex:1 1 0}#mpOnline .ol-act.ol-out{color:#ffd0c0}' +
    '#mpOnline .ol-board{display:flex;flex-direction:column;gap:6px;min-height:0}' +
    '#mpOnline .ol-bh{align-self:flex-start;display:flex;align-items:center;gap:9px;margin:4px 0 0 4px;padding:5px 16px 5px 12px;background:var(--tk);color:#fff8ee;' +
    'font:800 14px/1 var(--display);letter-spacing:.16em;text-transform:uppercase;text-shadow:none;transform:skewX(-12deg);box-shadow:3px 3px 0 rgba(0,0,0,.35)}' +
    '#mpOnline .ol-bh>*{transform:skewX(12deg)}' +
    '#mpOnline .ol-live{width:9px;height:9px;border-radius:50%;background:#ff4d5e;box-shadow:0 0 0 0 rgba(255,77,94,.6);animation:olLive 1.8s ease-out infinite}' +
    '@keyframes olLive{0%{box-shadow:0 0 0 0 rgba(255,77,94,.65)}70%,100%{box-shadow:0 0 0 7px rgba(255,77,94,0)}}' +
    '#mpOnline .ol-n{color:#ffd23f;letter-spacing:.08em}#mpOnline .ol-rec{padding-left:10px;border-left:1px solid rgba(255,255,255,.25);color:var(--muted);letter-spacing:.08em}' +
    '#mpOnline .ol-rec b{color:#fff8ee}' +
    '#mpOnline .ol-rooms{display:flex;flex-direction:column;gap:7px;max-height:calc(4 * 69px);overflow:auto;padding:3px 10px 6px 6px;margin:0 -10px 0 -6px;scrollbar-width:thin}' +
    // franja: el botón no lleva fondo (el deshabilitado de siempre quitaría la inclinación); la pieza inclinada es .fx-in
    '#mpOnline .ol-fx{display:block;flex:none;width:100%;height:62px;padding:0;margin:0;border-radius:0;background:none;box-shadow:none;text-align:left;text-transform:none;letter-spacing:0;color:#fff;text-shadow:none;outline:none}' +
    '#mpOnline .ol-fx:hover,#mpOnline .ol-fx:active{filter:none;transform:none;box-shadow:none}' +
    '#mpOnline .fx-in{display:grid;grid-template-columns:100px minmax(0,1fr) auto;height:100%;overflow:hidden;background:rgba(22,16,40,.93);transform:skewX(-9deg);transform-origin:50% 100%;' +
    'box-shadow:inset 0 0 0 2.5px var(--tk),4px 4px 0 var(--tk);transition:transform .16s var(--ease),background .16s}' +
    '#mpOnline .fx-in>*{transform:skewX(9deg)}' +
    '#mpOnline .ol-fx:hover .fx-in{background:rgba(40,31,74,.95)}' +
    '#mpOnline .ol-fx:focus-visible .fx-in,#mpOnline .ol-fx.kf .fx-in{background:rgba(44,34,82,.97);transform:skewX(-9deg) translateX(6px);box-shadow:inset 0 0 0 2.5px var(--tk),inset 0 0 0 5px #ffd23f,5px 5px 0 var(--tk)}' +
    '#mpOnline .ol-fx:active .fx-in{transform:skewX(-9deg) translate(3px,2px);box-shadow:inset 0 0 0 2.5px var(--tk),1px 1px 0 var(--tk)}' +
    '#mpOnline .fx-ven{display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0;padding:0 8px 0 20px;margin-left:-10px;color:var(--tk);box-shadow:inset -2.5px 0 0 var(--tk)}' +
    '#mpOnline .v-beach .fx-ven,#mpOnline .v-beach .mt-top{background:repeating-linear-gradient(115deg,rgba(255,255,255,.2) 0 5px,transparent 5px 13px),#f0bd5e}' +
    '#mpOnline .v-hall .fx-ven,#mpOnline .v-hall .mt-top{background:repeating-linear-gradient(90deg,rgba(60,24,0,.18) 0 2px,transparent 2px 19px),#c97f40}' +
    '#mpOnline .fx-ven b{font:900 15px/1 var(--display);font-style:italic;letter-spacing:.06em;text-transform:uppercase}' +
    '#mpOnline .fx-ven small{font:700 10.5px/1.1 var(--ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85}' +
    '#mpOnline .fx-main{display:flex;flex-direction:column;justify-content:center;gap:5px;min-width:0;padding:0 8px 0 14px}' +
    '#mpOnline .fx-line{display:flex;align-items:center;gap:9px;min-width:0}' +
    '#mpOnline .fx-name{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:900 27px/1 var(--display);font-style:italic;letter-spacing:.02em;text-transform:uppercase;' +
    'color:#fff8ee;text-shadow:var(--ring1),2px 2px 0 var(--tk)}' +
    '#mpOnline .fx-vs{flex:none;font:900 15px/1 var(--display);font-style:italic;color:#ffd23f}' +
    '#mpOnline .fx-slot{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:25px;padding:0 6px;border:2px dashed rgba(255,255,255,.4);border-radius:3px;' +
    'font:900 17px/1 var(--display);color:rgba(255,255,255,.55)}' +
    '#mpOnline .fx-slot.in{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-style:solid;color:#fff8ee;text-transform:uppercase;font-size:15px}' +
    '#mpOnline .fx-chips{display:flex;gap:5px;min-width:0;overflow:hidden}' +
    '#mpOnline .fx-chips i{flex:none;font:700 11.5px/1 var(--ui);font-style:normal;padding:3px 7px;border-radius:3px;background:rgba(255,255,255,.09);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16);color:var(--soft);white-space:nowrap}' +
    '#mpOnline .fx-end{display:flex;align-items:center;gap:12px;padding:0 20px 0 6px}' +
    '#mpOnline .fx-st{display:flex;align-items:center;gap:6px;font:700 12px/1 var(--ui);color:var(--soft);white-space:nowrap}' +
    '#mpOnline .fx-st::before{content:"";width:8px;height:8px;border-radius:50%;background:#49dd85;box-shadow:0 0 6px #49dd85}' +
    '#mpOnline .fx-st.st-full::before{background:#ff8a3d;box-shadow:0 0 6px #ff8a3d}#mpOnline .fx-st.st-ver::before{background:#8f88b5;box-shadow:none}' +
    '#mpOnline .fx-go{padding:8px 13px 7px;border-radius:3px;font:900 17px/1 var(--display);font-style:italic;letter-spacing:.06em;text-transform:uppercase;color:#ffd23f;box-shadow:inset 0 0 0 2px #ffd23f;transition:background .16s,color .16s}' +
    '#mpOnline .ol-fx:hover .fx-go,#mpOnline .ol-fx:focus-visible .fx-go,#mpOnline .ol-fx.kf .fx-go{background:#ffd23f;color:var(--tk);box-shadow:inset 0 0 0 2px var(--tk),2px 3px 0 var(--tk)}' +
    '#mpOnline .ol-fx.fx-off{opacity:1;filter:none}#mpOnline .ol-fx.fx-off .fx-in{background:rgba(22,16,40,.7)}#mpOnline .ol-fx.fx-off .fx-name{color:var(--dim-text)}' +
    '#mpOnline .ol-fx.fx-off .fx-ven{filter:saturate(.3) brightness(.8)}' +
    '#mpOnline .ol-fx.fx-new{animation:fxIn .38s var(--ease) both}@keyframes fxIn{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}' +
    '#mpOnline .ol-empty{display:flex;align-items:center;gap:16px;margin:0 6px;padding:12px 18px;border-radius:0;background:rgba(22,16,40,.72);box-shadow:none;outline:2px dashed rgba(255,255,255,.28);outline-offset:-2px;' +
    'transform:skewX(-9deg);font:700 15px/1.3 var(--ui);color:var(--fg2)}#mpOnline .ol-empty>*{transform:skewX(9deg)}' +
    '#mpOnline .ol-ghost{flex:none;display:flex;align-items:center;gap:7px;font:900 26px/1 var(--display);font-style:italic;color:rgba(255,255,255,.28)}' +
    '#mpOnline .ol-ghost i{font-style:italic}#mpOnline .ol-ghost em{font-size:14px;font-style:italic;color:rgba(255,210,63,.6)}' +
    // sala de espera: el mismo rótulo, en grande
    '#mpOnline .ol-card.ol-match{padding:0 0 12px;border-radius:12px;overflow:hidden;background:rgba(22,16,40,.93);box-shadow:inset 0 0 0 2.5px var(--tk),4px 5px 0 var(--tk)}' +
    '#mpOnline .mt-top{display:flex;align-items:center;gap:10px;padding:8px 12px 8px 16px;color:var(--tk);box-shadow:inset 0 -2.5px 0 var(--tk),inset 0 0 0 2.5px var(--tk)}' +
    '#mpOnline .mt-ven{display:flex;align-items:baseline;gap:8px;min-width:0}#mpOnline .mt-ven b{font:900 17px/1 var(--display);font-style:italic;letter-spacing:.06em;text-transform:uppercase}' +
    '#mpOnline .mt-ven small{font:700 12px/1 var(--ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#mpOnline .mt-who{margin-left:auto;font:700 13px/1 var(--ui);white-space:nowrap}' +
    '#mpOnline .mt-top .ol-code{margin:0;padding:4px 9px;border-radius:3px;background:var(--tk);color:#ffd23f}' +
    '#mpOnline .ol-match .ol-vs{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:end;gap:10px;margin:14px 16px 10px}' +
    '#mpOnline .mt-side{gap:4px}#mpOnline .mt-side small{display:flex;gap:5px;align-items:center}' +
    '#mpOnline .mt-side b{font:900 36px/1 var(--display);font-style:italic;letter-spacing:.02em;text-transform:uppercase;color:#fff8ee;text-shadow:var(--ring1),3px 3px 0 var(--tk)}' +
    '#mpOnline .mt-side.riv b{animation:mtIn .42s var(--ease) both}@keyframes mtIn{from{opacity:0;transform:translateX(26px) scale(1.15)}to{opacity:1;transform:none}}' +
    '#mpOnline .ol-match .mt-side.wait b .ol-q{font:900 36px/1 var(--display)}#mpOnline .mt-side.wait b{display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.4);font-size:36px}' +
    '#mpOnline .ol-dots{display:flex;gap:4px}#mpOnline .ol-dots i{width:7px;height:7px;border-radius:50%;background:#ffd23f;animation:olDot 1.2s ease-in-out infinite}' +
    '#mpOnline .ol-dots i:nth-child(2){animation-delay:.2s}#mpOnline .ol-dots i:nth-child(3){animation-delay:.4s}@keyframes olDot{0%,80%,100%{opacity:.2;transform:none}40%{opacity:1;transform:translateY(-4px)}}' +
    '#mpOnline .ol-match .ol-mid{padding:0;font:900 30px/1 var(--display);font-style:italic;color:#ffd23f;text-shadow:var(--ring1),2px 3px 0 var(--tk);transform:rotate(-6deg)}' +
    '#mpOnline .mt-chips{justify-content:center;margin:0 16px}#mpOnline .ol-match .ol-st{margin:10px 16px 0;text-align:center}#mpOnline .ol-match p.ol-tip{margin:6px 16px 0;text-align:center}' +
    // teclado en pantalla (mando)
    '#mpOnline .ol-osk{display:flex;flex-direction:column;gap:5px;padding:8px 10px 10px;border-radius:12px;background:rgba(22,16,40,.95);box-shadow:inset 0 0 0 2.5px var(--tk),4px 5px 0 var(--tk)}' +
    '#mpOnline .osk-show{display:flex;align-items:center;gap:10px;min-width:0;padding:2px 4px 4px}' +
    '#mpOnline .osk-lbl{flex:none;font:800 12px/1 var(--display);letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}' +
    '#mpOnline .osk-val{flex:1 1 auto;min-width:0;display:flex;align-items:center;height:34px;padding:0 10px;overflow:hidden;white-space:pre;background:rgba(5,9,18,.85);box-shadow:inset 0 0 0 2px #ff7a3e;' +
    'font:800 22px/1 var(--display);letter-spacing:.04em;color:#fff}#mpOnline .ol-osk.code .osk-val{letter-spacing:.3em}' +
    '#mpOnline .osk-car{display:inline-block;width:2px;height:22px;margin-left:2px;background:#ffd23f;animation:oskCar 1s steps(1) infinite}@keyframes oskCar{50%{opacity:0}}' +
    '#mpOnline .osk-tip{flex:none;font:600 12px/1 var(--ui);color:var(--muted)}' +
    '#mpOnline .osk-row{display:flex;gap:5px}' +
    '#mpOnline .osk-k{flex:1 1 0;min-width:0;height:36px;padding:0;margin:0;border-radius:6px;font:800 18px/1 var(--display);letter-spacing:.02em;text-transform:none;color:#fff;background:var(--cel-a);' +
    'box-shadow:inset 0 0 0 2px var(--tk),0 3px 0 var(--tk);text-shadow:var(--ring1)}' +
    '#mpOnline .osk-k.fn{font-size:15px;letter-spacing:.08em;text-transform:uppercase}#mpOnline .osk-k.w{flex:2.4 1 0}#mpOnline .osk-k.ok{background:var(--pri)}' +
    '#mpOnline .osk-k:focus-visible,#mpOnline .osk-k.kf{background:var(--cel-hi);box-shadow:inset 0 0 0 2px var(--tk),inset 0 0 0 4px #ffd23f,0 3px 0 var(--tk);outline:none;transform:translateY(-2px)}' +
    '#mpOnline .ol-edit .ol-act{height:52px}' +
    '@media (max-height:420px){#mpOnline .ol-body{gap:8px}#mpOnline .ol-act{height:40px;font-size:14px;padding:0 11px}#mpOnline .ol-act.ol-new{font-size:15px;padding:0 13px}' +
    '#mpOnline .ol-act.ol-ico{width:40px}#mpOnline .ol-me{font-size:15px}#mpOnline .ol-bh{font-size:12px;padding:4px 13px 4px 10px;margin-top:0}' +
    '#mpOnline .ol-rooms{gap:4px;max-height:calc(100vh - 178px)}#mpOnline .ol-fx{height:46px}' +
    '#mpOnline .fx-in{grid-template-columns:80px minmax(0,1fr) auto}#mpOnline .fx-ven b{font-size:13px}#mpOnline .fx-ven small{font-size:9.5px}' +
    '#mpOnline .fx-main{gap:3px;padding-left:11px}#mpOnline .fx-name{font-size:21px}#mpOnline .fx-vs{font-size:13px}#mpOnline .fx-slot{height:21px;min-width:28px;font-size:15px}' +
    '#mpOnline .fx-chips i{font-size:10px;padding:2px 6px}#mpOnline .fx-end{gap:9px;padding-right:16px}#mpOnline .fx-st{font-size:11px}#mpOnline .fx-go{font-size:14px;padding:6px 10px 5px}' +
    '#mpOnline .ol-empty{padding:9px 14px;font-size:13px}#mpOnline .ol-ghost{font-size:21px}' +
    '#mpOnline .mt-top{padding:5px 10px 5px 14px}#mpOnline .ol-match .ol-vs{margin:8px 14px 6px}#mpOnline .mt-side b,#mpOnline .mt-side.wait b{font-size:27px}#mpOnline .ol-match .ol-mid{font-size:24px}#mpOnline .ol-match .mt-side.wait b .ol-q{font-size:27px}' +
    '#mpOnline .ol-card.ol-match{padding-bottom:8px}#mpOnline .ol-match .ol-st{margin-top:6px}' +
    '#mpOnline .ol-osk{gap:4px;padding:6px 8px 8px}#mpOnline .osk-show{padding:0 2px 2px}#mpOnline .osk-val{height:30px;font-size:19px}#mpOnline .osk-k{height:31px;font-size:16px}#mpOnline .osk-k.fn{font-size:13px}}' +
    '@media (prefers-reduced-motion:reduce){#mpOnline .ol-fx.fx-new,#mpOnline .mt-side.riv b{animation:none}#mpOnline .ol-live,#mpOnline .ol-dots i{animation:none}}' +
    // ---- fase 6: «Crear sala» con el lenguaje del rótulo, «Cómo funciona» a juego y vertical (≤ 620 px de ancho) ----
    '#mpOnline .ol-mk,#mpOnline .hp-box{overflow:hidden;border-radius:12px;background:rgba(22,16,40,.93);box-shadow:inset 0 0 0 2.5px var(--tk),4px 5px 0 var(--tk)}' +
    '#mpOnline .mk-prev{padding:12px 22px 10px 16px}' +
    '#mpOnline .ol-fx.fx-prev{pointer-events:none}#mpOnline .fx-prev .fx-in{background:rgba(44,34,82,.9)}' +
    '#mpOnline .mk-sels{display:flex;flex-direction:column;margin:0 10px;padding:0 0 2px}' +
    '#mpOnline .ol-sel{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;height:40px;padding:0 4px 0 14px;margin:0;border-radius:0;background:none;' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.1);text-align:left;text-transform:none;letter-spacing:0;color:#fff;text-shadow:none;outline:none;transition:background .14s}' +
    '#mpOnline .ol-sel:hover,#mpOnline .ol-sel:active{filter:none;transform:none;background:rgba(255,255,255,.05)}' +
    '#mpOnline .ol-sel:focus-visible,#mpOnline .ol-sel.kf{background:rgba(255,210,63,.11);box-shadow:inset 0 1px 0 rgba(255,255,255,.1),inset 5px 0 0 #ffd23f}' +
    '#mpOnline .sl-k{flex:none;font:800 14px/1 var(--display);letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}' +
    '#mpOnline .sl-v{display:flex;align-items:center;min-width:0;height:100%}' +
    '#mpOnline .sl-v b{min-width:150px;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font:900 20px/1 var(--display);font-style:italic;letter-spacing:.03em;' +
    'text-transform:uppercase;color:#fff8ee;text-shadow:var(--ring1)}' +
    '#mpOnline .sl-v .arr{display:flex;align-items:center;justify-content:center;width:34px;height:100%;cursor:pointer}' +
    '#mpOnline .sl-v .arr svg{width:18px;height:18px;fill:none;stroke:rgba(255,255,255,.35);stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;transition:stroke .14s,transform .14s var(--ease)}' +
    '#mpOnline .ol-sel:hover .arr svg{stroke:rgba(255,255,255,.7)}#mpOnline .sl-v .arr:hover svg{stroke:#fff}' +
    '#mpOnline .ol-sel:focus-visible .sl-k,#mpOnline .ol-sel.kf .sl-k{color:#ffd23f}' +
    '#mpOnline .ol-sel:focus-visible .sl-v b,#mpOnline .ol-sel.kf .sl-v b{color:#ffd23f}' +
    '#mpOnline .ol-sel:focus-visible .arr svg,#mpOnline .ol-sel.kf .arr svg{stroke:#ffd23f}' +
    '#mpOnline .sl-v .arr[data-d="-1"]:active svg{transform:translateX(-3px)}#mpOnline .sl-v .arr[data-d="1"]:active svg{transform:translateX(3px)}' +
    '#mpOnline .mk-tip{margin:0;padding:8px 16px 10px;font:600 13px/1.35 var(--ui);color:var(--muted);box-shadow:inset 0 1px 0 rgba(255,255,255,.1)}' +
    '#mpOnline .mk-go .ol-act{height:52px;font-size:20px}' +
    '.is-touch #mpOnline .sl-v .arr{width:44px}' +
    // «Cómo funciona»: rótulo inclinado y una sola caja con filas (como los selectores), sin tarjeta con antetítulo
    '#mpOnline .ol-help{display:flex;flex-direction:column;gap:6px;min-height:0}' +
    '#mpOnline dl.hp-box{display:block;margin:0}' +
    '#mpOnline .hp-box>div{display:grid;grid-template-columns:118px minmax(0,1fr);gap:12px;align-items:baseline;padding:8px 16px 8px 14px;box-shadow:inset 0 -1px 0 rgba(255,255,255,.1)}' +
    '#mpOnline .hp-box>div:last-child{box-shadow:none}' +
    '#mpOnline .hp-box dt{font:900 14px/1.3 var(--display);font-style:italic;letter-spacing:.06em;text-transform:uppercase;color:#ffd23f}' +
    '#mpOnline .hp-box dd{margin:0;font:600 14px/1.38 var(--ui);color:var(--soft)}' +
    '#mpOnline .hp-go .ol-act{height:52px;font-size:20px}' +
    '@media (max-height:420px){#mpOnline .mk-prev{padding:6px 18px 5px 14px}#mpOnline .ol-mk .mt-top{display:none}#mpOnline .ol-sel{height:30px}#mpOnline .sl-k{font-size:12px}' +
    '#mpOnline .sl-v b{font-size:16px;min-width:120px}#mpOnline .mk-tip{display:none}#mpOnline .mk-go .ol-act,#mpOnline .hp-go .ol-act{height:40px;font-size:16px}' +
    '#mpOnline .hp-box>div{display:block;padding:4px 12px}#mpOnline .hp-box dt{display:inline;margin-right:7px;font-size:11.5px}#mpOnline .hp-box dd{display:inline}#mpOnline .hp-box dd{font-size:12px;line-height:1.28}}' +
    // vertical (teléfono de pie): la barra en dos filas, franjas más estrechas (estado bajo «Entrar»), teclado y ayuda compactos
    '@media (max-width:620px){#mpOnline .ol-bar:not(.ol-bar2){flex-wrap:wrap}#mpOnline .ol-bar:not(.ol-bar2) .ol-new{flex:1 1 auto}' +
    '#mpOnline .ol-act.ol-nm{flex:1 1 calc(100% - 108px)}' +
    '#mpOnline .ol-rooms{max-height:calc(100vh - 330px)}' +
    '#mpOnline .ol-fx{height:64px}#mpOnline .fx-in{grid-template-columns:62px minmax(0,1fr) auto}' +
    '#mpOnline .fx-ven{padding:0 2px 0 15px}#mpOnline .fx-ven b{font-size:11.5px;letter-spacing:.02em}#mpOnline .fx-ven small{display:none}' +
    '#mpOnline .fx-main{padding:0 4px 0 10px;gap:6px}#mpOnline .fx-line{gap:6px}#mpOnline .fx-name{font-size:21px}#mpOnline .fx-vs{font-size:13px}' +
    '#mpOnline .fx-slot{min-width:26px;height:22px;font-size:14px}#mpOnline .fx-slot.in{max-width:66px;font-size:12px}' +
    '#mpOnline .fx-chips{gap:4px}#mpOnline .fx-chips i{font-size:10.5px;padding:3px 5px}' +
    '#mpOnline .fx-end{flex-direction:column;align-items:flex-end;justify-content:center;gap:6px;padding:0 14px 0 2px}' +
    '#mpOnline .fx-st{font-size:10.5px;gap:5px}#mpOnline .fx-go{font-size:14px;padding:6px 9px 5px}' +
    '#mpOnline .ol-empty{gap:12px;padding:12px 14px;font-size:13.5px}#mpOnline .ol-ghost{font-size:21px}' +
    '#mpOnline .ol-bh{font-size:12.5px;letter-spacing:.12em;flex-wrap:wrap;row-gap:4px}' +
    '#mpOnline .mt-top{flex-wrap:wrap;row-gap:4px}#mpOnline .mt-side b,#mpOnline .mt-side.wait b,#mpOnline .ol-match .mt-side.wait b .ol-q{font-size:29px}' +
    '#mpOnline .ol-match .ol-vs{margin:12px 12px 8px;gap:6px}#mpOnline .ol-match .ol-mid{font-size:24px}' +
    '#mpOnline .mk-prev{padding:8px 10px 6px 8px}#mpOnline .fx-prev .fx-go{display:none}#mpOnline .fx-prev .fx-ven{display:none}#mpOnline .fx-prev .fx-in{grid-template-columns:minmax(0,1fr) auto}#mpOnline .fx-prev .fx-main{padding-left:14px}' +
    '#mpOnline .ol-sel{height:44px;padding-left:12px}#mpOnline .sl-k{font-size:12.5px;letter-spacing:.1em}' +
    '#mpOnline .sl-v b{min-width:0;width:128px;font-size:17px}' +
    '#mpOnline .osk-show{flex-wrap:wrap;row-gap:4px}#mpOnline .osk-tip{order:3;width:100%}#mpOnline .ol-osk{padding:8px 7px 10px}#mpOnline .osk-row{gap:4px}' +
    '#mpOnline .osk-k{height:40px;font-size:17px}#mpOnline .osk-k.fn{font-size:12.5px;letter-spacing:.04em}' +
    '#mpOnline .hp-box>div{display:block;padding:7px 12px}#mpOnline .hp-box dt{display:inline;margin-right:7px;font-size:12.5px}#mpOnline .hp-box dd{display:inline;font-size:13px;line-height:1.36}}' +
    '#menu .m-onl .md-art{background:#3d5bd9}';
  function ensureCss() { if (document.getElementById('olCss')) return; var s = document.createElement('style'); s.id = 'olCss'; s.textContent = CSS; document.head.appendChild(s); }
  ensureCss();   // (ya al cargar: la tarjeta de Jugar usa .has-onl / .m-onl antes de abrir el lobby)

  function row(a, label, help, right, extra) {
    return '<button class="mi' + (extra && extra.primary ? ' primary' : '') + '" data-a="' + a + '"' + (extra && extra.id ? ' data-id="' + esc(extra.id) + '"' : '') +
      (extra && extra.dis ? ' disabled' : '') + (extra && extra.aria ? ' aria-label="' + esc(extra.aria) + '"' : '') + '>' +
      '<span class="mi-l">' + label + (help ? '<small class="mi-h">' + help + '</small>' : '') + '</span>' + (right ? '<span class="ol-r">' + right + '</span>' : '') + '</button>';
  }
  var ARR_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>', ARR_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>';
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
  /** Una franja de la cartelera (rótulo de TV). o.prev: vista previa de «Crear sala» (no es un botón ni se puede pulsar). */
  function fxHTML(r, o) {
    o = o || {};
    var full = r.state === 'full', off = !o.prev && (r.other || full), beach = r.venue === 'beach', vn = venueName(r), kind = beach ? 'Playa' : 'Pabellón';
    var tag = o.prev ? 'div' : 'button';
    return '<' + tag + ' class="ol-fx ' + (beach ? 'v-beach' : 'v-hall') + (o.isNew ? ' fx-new' : '') + (off ? ' fx-off' : '') + (o.prev ? ' fx-prev' : '') + '"' +
      (o.prev ? '' : ' data-a="join" data-id="' + esc(r.id) + '"' + (off || L.busy ? ' disabled' : '') +
        ' aria-label="' + esc('Sala de ' + r.name + '. ' + cfgParts(r).join(', ') + (r.other ? '. Otra versión del juego' : full ? '. Llena' : '. Una plaza libre')) + '"') +
      (o.isNew ? ' style="animation-delay:' + (o.delay | 0) + 'ms"' : '') + '><span class="fx-in">' +
      '<span class="fx-ven"><b>' + kind + '</b>' + (vn && vn !== kind ? '<small>' + esc(vn) + '</small>' : '') + '</span>' +
      '<span class="fx-main"><span class="fx-line"><b class="fx-name">' + esc(r.name) + '</b><i class="fx-vs">VS</i>' +
      '<span class="fx-slot' + (full ? ' in' : '') + '">' + (full ? esc(r.gname || 'Rival') : '?') + '</span></span>' +
      '<span class="fx-chips">' + chipsHTML(r) + '</span></span>' +
      '<span class="fx-end"><span class="fx-st ' + (r.other ? 'st-ver' : full ? 'st-full' : 'st-open') + '">' + (r.other ? 'Otra versión' : full ? 'Llena' : 'Abierta') + '</span>' +
      (off ? '' : '<span class="fx-go">Entrar</span>') + '</span></span></' + tag + '>';
  }
  /** Selector compacto de «Crear sala»: nombre a la izquierda, ‹ valor › a la derecha (←→ o las flechas con ratón / táctil). */
  function selRow(k, label, val, hint) {
    return '<button class="ol-sel" data-ol="' + k + '" aria-label="' + esc(label + ': ' + val + '. ' + hint) + '"><span class="sl-k">' + esc(label) + '</span>' +
      '<span class="sl-v"><span class="arr" data-d="-1">' + ARR_L + '</span><b>' + esc(val) + '</b><span class="arr" data-d="1">' + ARR_R + '</span></span></button>';
  }
  function helpHTML() {
    // (fase 6) rótulo inclinado como «Salas abiertas» y una sola caja con una fila por punto (el mismo lenguaje que la cartelera)
    return '<div class="ol-help"><h3 class="ol-bh">Cómo funciona el online</h3><dl class="hp-box">' +
      HELP.map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>'; }).join('') + '</dl></div>';
  }
  function svg(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>'; }
  var IC = {
    plus: svg('M12 5v14M5 12h14'), hash: svg('M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16'), pen: svg('M4 20l1-4L16 5l3 3L8 19zM14 7l3 3'),
    ref: svg('M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4'), copy: svg('M8 8h11v11H8zM5 16V5h11'), out: svg('M14 5h5v14h-5M10 8l-4 4 4 4M6 12h10')
  };
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
    if (!L.osk) {
      if (code) return '<div class="ol-edit"><input id="olIn" class="code" maxlength="7" autocomplete="off" spellcheck="false" aria-label="Código de la sala" placeholder="K7P2QX"><button class="ol-act ol-new" data-a="codeOk">Entrar</button></div>';
      return '<div class="ol-edit"><input id="olIn" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Tu nombre en el online" value="' + esc(nm) + '"><button class="ol-act ol-new" data-a="nameOk">Guardar</button></div>';
    }
    var o = L.osk, h = '<div class="ol-osk' + (code ? ' code' : '') + '"><div class="osk-show"><span class="osk-lbl">' + (code ? 'Código' : 'Tu nombre') + '</span>' +
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
      h = helpHTML() + '<div class="ol-bar ol-bar2 hp-go" data-nav><button class="ol-act ol-new" data-a="helpOk">Entendido</button></div>';
    } else if (v === 'list') {
      // (rediseño 1.5.x, petición de Ferran: que las salas no parezcan botones del menú) Arriba, una BARRA de acciones compacta
      // (un solo alto en ↑↓; ←→ recorre la barra). Debajo, la CARTELERA: una franja por sala como un rótulo de TV.
      var nm = myName(), bk = L.barKey || 'new';
      if (bk === 'new' && L.busy) bk = 'code';   // («Crear sala» desactivado: la parada de la barra pasa a «Código», para no quedarse sin ninguna)
      var act = function (a, inner, cls, aria, dis) {
        return '<button class="ol-act' + (cls ? ' ' + cls : '') + '" data-a="' + a + '"' + (a === bk ? '' : ' data-skip') + (dis ? ' disabled' : '') +
          (aria ? ' aria-label="' + esc(aria) + '"' : '') + '>' + inner + '</button>';
      };
      h = note() + '<div class="ol-bar" data-nav>' +
        act('new', IC.plus + '<span>Crear sala</span>', 'ol-new', '', L.busy) +
        act('code', IC.hash + '<span>Código</span>', '', 'Entrar con código') +
        act('name', IC.pen + '<span class="ol-me">' + esc(nm) + '</span>', 'ol-nm', 'Tu nombre: ' + nm + '. Cambiar') +
        act('refresh', IC.ref, 'ol-ico' + (L.loading ? ' spin' : ''), 'Actualizar') +
        act('help', '<span class="ol-q">?</span>', 'ol-ico', 'Cómo funciona') + '</div>';
      if (L.edit === 'name' || L.edit === 'code') h += editHTML(nm);
      if (L.osk) return h;   // (teclado en pantalla abierto: ocupa el sitio de la cartelera, sobre todo en un teléfono apaisado)
      // (fase 3: tu récord online, aparte del de Partido rápido; abandonar cuenta como derrota)
      var rl = VB.NetRec ? safe(function () { return VB.NetRec.line(); }) : '';
      var n = L.rooms.length, cnt = L.loading && !L.listAt ? 'Buscando…' : L.listAt ? (n === 1 ? '1 sala' : n + ' salas') : '';
      h += '<div class="ol-board"><h3 class="ol-bh"><span class="ol-live" aria-hidden="true"></span>Salas abiertas<span class="ol-n">' + cnt + '</span>' +
        (rl ? '<span class="ol-rec">Tu récord <b>' + esc(rl) + '</b></span>' : '') + '</h3>';
      if (L.listErr) h += '<p class="ol-note bad">' + esc(L.listErr) + '</p>';
      h += '<div class="ol-rooms" data-nav>';
      if (!n) h += L.listAt ? '<div class="ol-empty"><span class="ol-ghost" aria-hidden="true"><i>?</i><em>VS</em><i>?</i></span><span>Aún no hay salas. Crea una y avisa a alguien.</span></div>' : '';
      // (animación de entrada: una sala es «nueva» durante 1 s desde que se ve por primera vez; así un repintado en ese segundo no la corta)
      var seen = L.seenAt || {}, now = {}, k = 0, tn = Date.now();
      L.rooms.forEach(function (r) {
        var t1 = now[r.id] = seen[r.id] || tn, isNew = tn - t1 < 1000;
        h += fxHTML(r, { isNew: isNew, delay: isNew ? k++ * 70 : 0 });
      });
      if (L.listAt) L.seenAt = now;
      h += '</div></div>';
    } else if (v === 'create') {
      var c = L.cfg, ms = maps(c.venue), cur = c.venue === 'beach' ? c.mapB : c.mapH;
      if (ms.indexOf(cur) < 0) { cur = ms[0]; if (c.venue === 'beach') c.mapB = cur; else c.mapH = cur; }
      var cb = c.venue === 'beach', ck = cb ? 'Playa' : 'Pabellón', vn = cur && VB.Venues && VB.Venues.name ? VB.Venues.name(cur) || cur : ck;
      // (fase 6) El mismo lenguaje que la cartelera: UN rótulo con la franja de la sede (arena / madera), la vista previa de tu sala tal
      // y como saldrá en la lista (TÚ VS ?, con sus chips) y debajo los selectores compactos (↑↓ elige, ←→ cambia). Sin tarjetas sueltas.
      var pr = { name: myName(), venue: c.venue, map: cur, bo: c.bo, pts: cb ? 21 : c.pts, even: c.even };
      h = note() + '<div class="ol-mk ' + (cb ? 'v-beach' : 'v-hall') + '">' +
        // (revisión) la franja ya no repite la sede (sale en la vista previa y en el selector «Sede»): solo su color y «Tu sala»
        '<div class="mt-top"><span class="mt-ven"><b>Tu sala</b></span><span class="mt-who">Así sale en la lista</span></div>' +
        '<div class="mk-prev" aria-hidden="true">' + fxHTML(pr, { prev: true }) + '</div>' +
        '<div class="mk-sels" data-nav>' +
        selRow('venue', 'Escenario', ck, cb ? 'En la arena' : 'En pista cubierta') +
        selRow('map', 'Sede', vn, 'Donde se juega') +
        selRow('bo', 'Partido', c.bo === 3 ? 'Mejor de 3' : '1 set', c.bo === 3 ? (cb ? 'Sets a 21; el tercero, a 15' : 'Gana quien gane 2 sets') : 'Un solo set') +
        (cb ? '' : selRow('pts', 'Puntos', String(c.pts), 'Puntos por set')) +
        selRow('even', 'Igualado', c.even ? 'Sí' : 'No', c.even ? 'Nadie lleva atributos ni insignias' : 'Cada persona, con los de su jugador') + '</div>' +
        '<p class="mk-tip">' + (c.even ? 'Igualado: nadie lleva atributos ni insignias.' : 'Cada persona juega con los atributos de su jugador.') + '</p></div>' +
        '<div class="ol-bar ol-bar2 mk-go" data-nav><button class="ol-act ol-new" data-a="open"' + (L.busy ? ' disabled' : '') + '>' + IC.plus + '<span>Abrir sala</span></button></div>';
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
        if (!n) return '<div class="ol-p mt-side ' + side + ' wait"><small>' + who + '</small><b><span class="ol-q">?</span><span class="ol-dots" aria-label="Esperando"><i></i><i></i><i></i></span></b></div>';
        return '<div class="ol-p mt-side ' + side + (isRival ? ' riv' : '') + '"><small>' + who + (isRival ? ' <span class="ar" aria-hidden="true">▼</span>' : '') + '</small><b>' + esc(n) + '</b></div>';
      };
      var b2 = r2.venue === 'beach', vn2 = venueName(r2), k2 = b2 ? 'Playa' : 'Pabellón';
      h = '<div class="ol-card ol-match ' + (b2 ? 'v-beach' : 'v-hall') + (riv ? ' has-riv' : '') + '">' +
        '<div class="mt-top"><span class="mt-ven"><b>' + k2 + '</b>' + (vn2 && vn2 !== k2 ? '<small>' + esc(vn2) + '</small>' : '') + '</span>' +
        '<span class="mt-who">' + (host ? 'Tu sala' : 'Sala de ' + esc(r2.name)) + '</span>' +
        '<span class="ol-code" aria-label="Código ' + esc(r2.code.split('').join(' ')) + '">' + esc(r2.code) + '</span></div>' +
        '<div class="ol-vs">' + pl(left, host ? 'Tú' : 'Rival', !host, 'mt-a') + '<span class="ol-mid">VS</span>' + pl(right, host ? 'Rival' : 'Tú', host && !!riv, 'mt-b') + '</div>' +
        '<div class="fx-chips mt-chips">' + chipsHTML(r2) + '</div>' +
        '<p class="ol-st' + (bad ? ' bad' : '') + '" role="status">' + esc(st) + '</p>' +
        (L.started ? '' : '<p class="ol-tip">Llevas a tu n.º 1 y la IA a tu pareja. No hay pausa durante el juego: entre sets, 10 s de descanso. Abandonar cuenta como derrota.</p>') + '</div>' +
        '<div class="ol-bar ol-bar2" data-nav>' + (host ? '<button class="ol-act" data-a="copy">' + IC.copy + '<span>Copiar código</span></button>' : '') +
        '<button class="ol-act ol-out" data-a="leave">' + IC.out + '<span>Salir de la sala</span></button></div>';
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
      var n = NR().cleanName(v);
      if (!n) { L.msg = 'El nombre tiene que tener entre 2 y 16 caracteres (y no puede ser un correo).'; L.msgBad = true; L.edit = ''; render(true); focusA('name'); return; }
      ls(NICK, n); L.msg = ''; L.edit = ''; render(true); focusA('name');
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
    if (k === 'venue') c.venue = c.venue === 'beach' ? 'hall' : 'beach';
    else if (k === 'map') { var ms = maps(c.venue), cur = c.venue === 'beach' ? c.mapB : c.mapH, i = ms.indexOf(cur); i = (i + (d > 0 ? 1 : -1) + ms.length) % ms.length; if (c.venue === 'beach') c.mapB = ms[i]; else c.mapH = ms[i]; }
    else if (k === 'bo') c.bo = c.bo === 3 ? 1 : 3;
    else if (k === 'pts') { var PV = [11, 15, 21, 25], pi = PV.indexOf(c.pts); c.pts = PV[((pi < 0 ? 2 : pi) + (d > 0 ? 1 : -1) + PV.length) % PV.length]; }
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
    else if (a === 'name' || a === 'code') {
      L.edit = a; L.msg = '';
      // (con mando: teclado en pantalla, con el foco en la primera letra)
      if (padNow()) { var v0 = a === 'name' ? myName() : ''; L.osk = { v: v0, col: 0, up: !v0, auto: !v0 }; render(true); focusSel('.osk-k[data-r="1"][data-i="0"]', true); }
      else { L.osk = null; render(true); }
    }
    else if (a === 'osk') oskKey(b.getAttribute('data-id'));
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
    if (L.edit) { var k = L.edit; L.edit = ''; L.osk = null; render(true); focusA(k); return true; }
    if (L.view === 'create') { L.msg = ''; setView('list'); refreshList(false); focusA('new'); return true; }
    if (L.view === 'help') { ls(HELPK, '1'); setView('list'); refreshList(false); focusA(L.helpFrom || 'help'); L.helpFrom = ''; return true; }
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
  window.addEventListener('pagehide', function () {
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
  var BACK = 'voley3d.online.back', BACK_MS = 50000;
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { } return null; }
  function backSave() {
    if (L.role === 'host') return hostBackSave();   // (fase 6: también el anfitrión)
    try {
      var C = ctx(), n = C && C.net, st = n && n.sess && n.sess.status;
      if (!L.started || L.role !== 'guest' || !n || n.slot !== 1 || !(st === 'playing' || st === 'waiting' || st === 'connecting' || st === 'starting')) return;
      ss(BACK, JSON.stringify({ id: L.room.id, uid: api().uid() || '', gen: L.gen | 0, ep: n.epoch | 0, rival: L.rival || n.rival || '', look: n.look && n.look.theirs || null, t: Date.now() }));
      return !!ss(BACK);   // (sessionStorage puede fallar: entonces se suelta el hueco como siempre)
    } catch (e) { }
    return false;
  }
  function backTry() {
    var b = null; try { b = JSON.parse(ss(BACK) || 'null'); } catch (e) { b = null; }
    ss(BACK, null);   // (un solo intento)
    if (!b || typeof b.id !== 'string' || !b.uid || noRtc()) return;
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
  function rejoin(r, b) {
    var C = ctx();
    try { if (VB.NetRec && VB.NetRec.resume) VB.NetRec.resume(); } catch (e) { }
    L.role = 'guest'; L.room = r; L.rival = NR().cleanName(b.rival) || r.name || 'Rival'; L.gen = b.gen | 0; L.started = true; L.status = 'play';
    var link = newLink();
    link.onclose = function () { matchClosed(link); };
    var ok = C.actions.startOnline({ slot: 1, link: link, opts: null, name: myName(), rivalName: L.rival, look: { mine: myLook(), theirs: saneLook(b.look) } });
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
        look: n.look && n.look.theirs || null, guest: L.room.guest, t: Date.now() }));
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
    L.role = 'host'; L.room = r; L.rival = NR().cleanName(b.rival) || NR().cleanName(r.gname) || 'Rival'; L.gen = Math.max(L.gen, b.gen | 0); L.started = true; L.status = 'play';
    every('beat', NR().BEAT_MS, hostBeat); hostBeat();
    var link = newLink();
    link.onclose = function () { matchClosed(link); };
    var ok = C.actions.startOnline({ slot: 0, link: link, opts: null, name: myName(), rivalName: L.rival, look: { mine: myLook(), theirs: saneLook(b.look) } });
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
    myName: myName, myStats: myStats, myLook: myLook, saneLook: saneLook,
    _state: function () { return { view: L.view, role: L.role, rival: L.rival, status: L.status, started: L.started, rooms: L.rooms.map(function (r) { return { id: r.id, name: r.name, other: r.other }; }), room: L.room && { id: L.room.id, code: L.room.code, state: L.room.state }, link: L.link && L.link.state, linkInfo: L.link && L.link.info(), msg: L.msg, fail: L.fail, emu: EMU }; },
    _link: function () { return L.link; }
  };
})();
