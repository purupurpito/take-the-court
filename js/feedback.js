/* TAKE THE COURT — js/feedback.js (owner: ui_main)
 * Sugerencias y avisos de fallos de los jugadores (1.22.1, 23-nov-2026; Ferran: «crea un boton de sugerencias y otro de bugs, que
 * guarde el feedback de los usuarios para poder resolverlo cuando toque»). Diseño y decisiones en notes/feedback.md.
 *
 *  - Dónde: Ajustes › Info («Sugerir una mejora» / «Avisar de un bug», desde la portada y desde la pausa) y una fila de dos manchas
 *    pequeñas en la pausa del partido (#btnPSug / #btnPBug). ui.js abre el panel 'fb' (#pnFb, sistema SPLAT) y llama a mount().
 *  - Formulario: tipo (Sugerencia | Bug, preseleccionado por el botón), texto (5-2000 caracteres) y, en los bugs, «¿Dónde pasó?»
 *    opcional (Partido, Carrera, Online, Menús, Otro). Enviar / Cancelar. Teclado, mando y táctil como el resto de paneles: todo
 *    es <button> dentro de [data-nav] (filas con data-sp-row) y el cuadro de texto lleva data-focus. Mientras se escribe, las teclas
 *    no llegan al juego (stopPropagation en el cuadro, como el lobby online): ni Q/E de pestañas, ni F de pantalla completa. Esc sale.
 *  - Contexto que se adjunta (SIN datos personales: nunca correo, IP ni nombre): versión, navegador y sistema (como env() de
 *    js/netlog.js), pantalla y ventana, móvil/táctil, calidad gráfica, pantalla o modo en que estaba (lo pasa ui.js), idioma y, SOLO
 *    en los bugs, los últimos 5 errores de JS (búfer propio con addEventListener('error' / 'unhandledrejection') y los
 *    console.error «[VB][ERROR]» de main.js/ui.js; las rutas se recortan al nombre del fichero). El uid de la cuenta si hay sesión
 *    ('' si no). El jugador ve en una línea qué se adjunta (ctxLine).
 *  - Guardado: Firestore REST, feedback/{id aleatorio de 20} con documents:commit (t = hora del SERVIDOR, transformación
 *    REQUEST_TIME; currentDocument.exists = false). Campos {kind:'sug'|'bug', text, where?, ver, ctx (JSON ≤ 4000), uid, t,
 *    state:'nuevo'}. Sin sesión, la escritura va sin Authorization. Reglas en firebase/firestore.rules (bloque FEEDBACK; las
 *    despliega Ferran: hasta entonces el servidor dice 403 y todo queda en la cola).
 *  - Cola: sin red, con 403/401, 429 o 5xx, en 'make-the-cut.feedbackq' (máx. 20; del aparato, nunca a DOCS) y se reintenta al
 *    arrancar (a los 4 s) y al volver la conexión. 400/413 se descartan; 409 (ya estaba) cuenta como enviado. Las reglas rechazan
 *    con 403 (igual que sin desplegar): lo que lleva 30 intentos y más de 14 días en la cola se tira (stale()). La cuenta (uid) se
 *    fija al mandarlo: al reintentar con otra sesión sale sin cuenta. Mensaje: «¡Gracias! Enviado» o «Guardado: se enviará en cuanto se pueda».
 *  - Anti-spam en el cliente: 1 envío cada 30 s y 10 al día ('make-the-cut.feedbackl' = {d:'AAAAMMDD', n, last}).
 *  - Visor para Ferran: pages/feedback.html (lo copia tools/build-pages.js); la fila «Buzón de opiniones» de Ajustes › Info solo
 *    sale con su cuenta (ui.js, la misma huella que el acta, ACTA_ALLOW). viewerUrl() da la dirección.
 *  - Pruebas: tools/feedbacktest.js (navegador y emulador de reglas) y los casos de feedback de tools/roomtest.js.
 * Se carga justo después de js/version.js (antes que el resto, para que el búfer de errores lo vea todo). Sin dependencias al cargar:
 * VB.Account, VB.ctx y VB.Splat se miran con guarda en cada llamada.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var VB = root.VB = root.VB || {};
  var QKEY = 'make-the-cut.feedbackq', LKEY = 'make-the-cut.feedbackl';
  var MIN = 5, MAX = 2000, CTX_MAX = 4000, Q_MAX = 20, Q_TRIES = 30, Q_AGE = 14 * 864e5, GAP_MS = 30000, DAY_MAX = 10, ERR_N = 5;
  var KINDS = ['sug', 'bug'];
  var WHERE = [['partido', 'Partido'], ['carrera', 'Carrera'], ['online', 'Online'], ['menus', 'Menús'], ['otro', 'Otro']];
  var WHERE_IDS = WHERE.map(function (w) { return w[0]; });
  var T0 = Date.now();
  var F = null;   // fetch de pruebas (_setFetch)

  // ------------------------------------------------------------------ búfer de errores (solo se adjunta en los bugs)
  var errs = [];
  /** Quita direcciones y rutas (file:///C:/Users/…/js/ui.js:12:3 → ui.js:12:3): nada del disco ni del dominio. Tampoco la
   *  consulta (?key=…&refresh_token=…) ni el #: queda el nombre del fichero y, si lo hay, :línea:columna. */
  function clean(s) {
    return String(s == null ? '' : s).replace(/(?:https?|file|blob|chrome-extension):\/\/[^\s)'"]*\/([^\/\s)'"?#]+)(?:[?#][^\s)'":]*)?/g, '$1')
      .replace(/[A-Za-z]:[\\\/][^\s)'"]*[\\\/]([^\\\/\s)'"?#]+)(?:[?#][^\s)'":]*)?/g, '$1').replace(/\s+/g, ' ').trim();
  }
  function pushErr(k, m, src) {
    m = clean(m).slice(0, 300); if (!m) return;
    var last = errs[errs.length - 1];
    if (last && last.m === m && last.k === k) { last.n = (last.n || 1) + 1; return; }
    errs.push({ k: k, m: m, s: clean(src).slice(0, 80), t: Math.round((Date.now() - T0) / 1000) });
    if (errs.length > ERR_N) errs.shift();
  }
  if (root.addEventListener) {
    root.addEventListener('error', function (e) {
      try {
        if (!e || (e.target && e.target !== root && e.target.tagName)) return;   // (recursos que no cargan: no son errores de JS)
        pushErr('error', e.message || (e.error && e.error.message) || 'Error', (e.filename || '') + (e.lineno ? ':' + e.lineno + (e.colno ? ':' + e.colno : '') : ''));
      } catch (x) { }
    });
    root.addEventListener('unhandledrejection', function (e) {
      try { var r = e && e.reason; pushErr('promesa', r && (r.message || r.code) ? (r.message || r.code) : String(r), r && r.stack ? String(r.stack).split('\n')[1] || '' : ''); } catch (x) { }
    });
  }
  // main.js y ui.js atrapan sus excepciones y las escriben con console.error('[VB][ERROR] …'): esas no llegan a 'error'.
  // Se envuelve console.error sin cambiar lo que hace (llama siempre a la original con los mismos argumentos).
  try {
    var C = root.console;
    if (C && typeof C.error === 'function' && !C.error.__vbFb) {
      var orig = C.error;
      var wrapped = function () {
        try { var a0 = arguments[0]; if (typeof a0 === 'string' && a0.indexOf('[VB][ERROR]') === 0) pushErr('vb', a0.slice(11), ''); } catch (e) { }
        return orig.apply(this, arguments);
      };
      wrapped.__vbFb = true; C.error = wrapped;
    }
  } catch (e) { }

  // ------------------------------------------------------------------ almacenamiento (siempre con try/catch)
  function lsGet(k) { try { return JSON.parse(root.localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) root.localStorage.removeItem(k); else root.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function queue() { var q = lsGet(QKEY); return Array.isArray(q) ? q.filter(function (x) { return x && x.id && x.d; }) : []; }
  function setQueue(q) { lsSet(QKEY, q.length ? q.slice(-Q_MAX) : null); }

  // ------------------------------------------------------------------ límites (1 cada 30 s, 10 al día)
  function today() { var d = new Date(); return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); }
  function limits() { var l = lsGet(LKEY); if (!l || typeof l !== 'object' || l.d !== today()) l = { d: today(), n: 0, last: (l && +l.last) || 0 }; return l; }
  /** {ok, wait (s que faltan), why: ''|'espera'|'dia'}. */
  function canSend(now) {
    now = now || Date.now();
    var l = limits();
    if (l.n >= DAY_MAX) return { ok: false, wait: 0, why: 'dia' };
    var w = (+l.last || 0) + GAP_MS - now;
    if (w > 0) return { ok: false, wait: Math.ceil(w / 1000), why: 'espera' };
    return { ok: true, wait: 0, why: '' };
  }
  function countSend(now) { var l = limits(); l.n = (l.n | 0) + 1; l.last = now || Date.now(); lsSet(LKEY, l); }

  // ------------------------------------------------------------------ contexto (sin datos personales)
  function r1(x) { return Math.round(x * 10) / 10; }
  /** Como env() de js/netlog.js (navegador, sistema, móvil, pantalla, núcleos, memoria) más la ventana y el táctil; sin red ni IP. */
  function env() {
    var n = root.navigator || {}, ua = String(n.userAgent || ''), o = {}, m;
    o.br = (m = /Edg\/(\d+)/.exec(ua)) ? 'Edge ' + m[1] : (m = /OPR\/(\d+)/.exec(ua)) ? 'Opera ' + m[1] : (m = /Firefox\/(\d+)/.exec(ua)) ? 'Firefox ' + m[1]
      : (m = /CriOS\/(\d+)/.exec(ua)) ? 'Chrome iOS ' + m[1] : (m = /Chrome\/(\d+)/.exec(ua)) ? 'Chrome ' + m[1] : (m = /Version\/(\d+).*Safari/.exec(ua)) ? 'Safari ' + m[1] : 'otro';
    o.os = (m = /Android (\d+)/.exec(ua)) ? 'Android ' + m[1] : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
      : /Mac OS X/.test(ua) ? (n.maxTouchPoints > 1 ? 'iPadOS' : 'macOS') : /Linux/.test(ua) ? 'Linux' : 'otro';
    o.mob = /Mobi|Android|iPhone|iPad/.test(ua) || (n.maxTouchPoints > 1 && /Mac OS X/.test(ua));
    o.touch = (n.maxTouchPoints | 0) > 0;
    try { o.scr = root.screen ? root.screen.width + 'x' + root.screen.height + '@' + r1(root.devicePixelRatio || 1) : ''; } catch (e) { o.scr = ''; }
    try { o.win = (root.innerWidth | 0) + 'x' + (root.innerHeight | 0); } catch (e) { }
    o.cores = n.hardwareConcurrency || 0; o.mem = n.deviceMemory || 0;
    try { var dm = root.matchMedia && (root.matchMedia('(display-mode: fullscreen)').matches || root.matchMedia('(display-mode: standalone)').matches); o.app = !!dm; } catch (e) { }
    try { o.ph = !!(root.document && root.document.documentElement.classList.contains('ph')); } catch (e) { }
    return o;
  }
  function quality() {
    var c = VB.ctx || {}, s = c.settings || {}, q = c.quality || {};
    return { set: String(s.quality || ''), now: String(q.name || q.id || (q.rank != null ? 'rank' + q.rank : '')) };
  }
  /** Contexto completo (objeto). info = {screen, mode} de ui.js (texto corto de dónde estaba). */
  function context(kind, info) {
    info = info || {};
    var n = root.navigator || {}, o = { v: 1, env: env(), q: quality(), lang: String(n.language || ''), screen: String(info.screen || '').slice(0, 160) };
    if (info.mode) o.mode = String(info.mode).slice(0, 120);
    try { var bd = root.__vbBuild; if (bd && bd.sha) o.sha = String(bd.sha).slice(0, 12); } catch (e) { }
    try { o.host = String(root.location && root.location.hostname || '').slice(0, 60) || 'local'; } catch (e) { }
    if (kind === 'bug') o.errs = errs.slice(-ERR_N).map(function (e) { var x = { k: e.k, m: e.m, t: e.t }; if (e.s) x.s = e.s; if (e.n) x.n = e.n; return x; });
    return o;
  }
  /** JSON del contexto ≤ 4000 caracteres (si no cabe, primero se recortan los errores). */
  function ctxJson(kind, info) {
    var o = context(kind, info), j = JSON.stringify(o);
    while (j.length > CTX_MAX && o.errs && o.errs.length) { o.errs.shift(); j = JSON.stringify(o); }
    if (j.length > CTX_MAX) { delete o.mode; o.screen = o.screen.slice(0, 40); j = JSON.stringify(o).slice(0, CTX_MAX); }
    return j;
  }
  /** Una línea para el jugador: qué se adjunta. */
  function ctxLine(kind, info) {
    var e = env(), q = quality(), qn = { low: 'baja', medium: 'media', high: 'alta', ultra: 'ultra', auto: 'automática' }[q.set] || q.set;
    var bits = ['versión ' + (VB.VERSION || '?'), e.br + ' en ' + e.os, 'pantalla ' + (e.win || e.scr).replace('x', '×')];
    if (qn) bits.push('calidad ' + qn);
    var tail = kind === 'bug' ? 'dónde estabas y los últimos errores del juego (' + Math.min(errs.length, ERR_N) + ')' : 'dónde estabas';
    return 'Se adjunta: ' + bits.join(', ') + ', ' + tail + '. Nada personal: ni correo ni nombre; si has entrado, el identificador de tu cuenta.';
  }

  // ------------------------------------------------------------------ validación
  function norm(t) { return String(t == null ? '' : t).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim(); }
  function validate(o) {
    if (!o || KINDS.indexOf(o.kind) < 0) return 'Elige si es una sugerencia o un bug.';
    var t = norm(o.text);
    if (t.length < MIN) return 'Escribe un poco más (al menos ' + MIN + ' letras).';
    if (t.length > MAX) return 'Es demasiado largo: como mucho ' + MAX + ' caracteres.';
    if (o.where && WHERE_IDS.indexOf(o.where) < 0) return 'Ese sitio no está en la lista.';
    return '';
  }

  // ------------------------------------------------------------------ envío
  var B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  function newId() {
    var a = new Uint8Array(20), s = '';
    try { root.crypto.getRandomValues(a); } catch (e) { for (var j = 0; j < 20; j++) a[j] = Math.floor(Math.random() * 256); }
    for (var i = 0; i < 20; i++) s += B62.charAt(a[i] % 62);
    return s;
  }
  function base() { var A = VB.Account; return String(A && A.FS_BASE || '').replace(/\/+$/, ''); }
  function auth() {
    var A = VB.Account;
    if (!A || !A.netAuth || (A.isIn && !A.isIn()) || (A.user && !A.user())) return Promise.resolve(null);
    return A.netAuth().then(function (a) { return a && a.uid && a.token ? a : null; }, function () { return null; });
  }
  /** Una escritura: d = {kind, text, where?, ver, ctx, uid}. d.uid es la cuenta que había AL MANDARLO ('' sin sesión): si al
   *  reintentar la sesión es otra (o ninguna), sale sin cuenta y sin Authorization, nunca con la cuenta de otro.
   *  Resuelve 'ok' | 'keep' (a la cola) | 'drop' (nunca pasará). */
  function write(id, d) {
    var b = base(), f = F || (typeof fetch === 'function' ? fetch.bind(root) : null);
    if (!b || !f) return Promise.resolve('keep');
    var name = b.replace(/^https?:\/\/[^\/]+\/v1\//, '') + '/feedback/' + id;
    return (d.uid ? auth() : Promise.resolve(null)).then(function (a) {
      if (a && a.uid !== d.uid) a = null;
      var flds = { kind: { stringValue: d.kind }, text: { stringValue: d.text }, ver: { stringValue: String(d.ver || '').slice(0, 20) }, ctx: { stringValue: d.ctx },
        uid: { stringValue: a ? a.uid : '' }, state: { stringValue: 'nuevo' } };
      if (d.where) flds.where = { stringValue: d.where };
      var body = JSON.stringify({ writes: [{ update: { name: name, fields: flds }, updateTransforms: [{ fieldPath: 't', setToServerValue: 'REQUEST_TIME' }], currentDocument: { exists: false } }] });
      var h = { 'Content-Type': 'application/json' }; if (a) h.Authorization = 'Bearer ' + a.token;
      return f(b + ':commit', { method: 'POST', headers: h, body: body, keepalive: body.length < 60000 });
    }).then(function (r) {
      var s = r && r.status | 0;
      if (r && r.ok) return 'ok';
      if (s === 409) return 'ok';                       // (un intento anterior sí llegó)
      if (s === 400 || s === 413) return 'drop';        // formato que las reglas nunca aceptarán
      return 'keep';                                    // 401/403 (reglas sin desplegar, o rechazo de las reglas: también es 403), 404, 429, 5xx
    }, function () { return 'keep'; });                  // sin red
  }
  var flushing = null;
  /** ¿Se tira ya? Firestore contesta 403 tanto con las reglas sin desplegar como a un documento que las reglas nunca aceptarán,
   *  así que la respuesta no sirve para distinguirlos: lo que lleva Q_TRIES intentos Y más de 14 días en la cola se descarta (si
   *  no, un elemento malo se reintentaría para siempre). */
  function stale(x, now) { return (x.tries | 0) >= Q_TRIES && now - (+x.at || 0) > Q_AGE; }
  /** Reintenta la cola. Resuelve {sent, left}. */
  function flush() {
    if (flushing) return flushing;
    var q = queue(); if (!q.length) return Promise.resolve({ sent: 0, left: 0 });
    var sent = 0, keep = [];
    flushing = q.reduce(function (p, x) {
      return p.then(function () {
        return write(x.id, x.d).then(function (r) {
          if (r === 'ok') sent++;
          else if (r === 'keep') { x.tries = (x.tries | 0) + 1; if (!x.at) x.at = Date.now(); if (!stale(x, Date.now())) keep.push(x); }
        });
      });
    }, Promise.resolve()).then(function () {
      // lo que haya entrado en la cola mientras tanto se conserva
      var now = queue(), ids = {}; q.forEach(function (x) { ids[x.id] = 1; });
      setQueue(keep.concat(now.filter(function (x) { return !ids[x.id]; })));
      flushing = null; return { sent: sent, left: queue().length };
    }, function () { flushing = null; return { sent: sent, left: queue().length }; });
    return flushing;
  }
  /** Envía o deja en la cola. o = {kind, text, where?, screen?, mode?}. Resuelve {status:'sent'|'queued'|'error', msg, id?}. */
  function submit(o) {
    o = o || {};
    var bad = validate(o); if (bad) return Promise.resolve({ status: 'error', msg: bad });
    var lim = canSend(); if (!lim.ok) return Promise.resolve({ status: 'error', msg: lim.why === 'dia' ? 'Ya has mandado ' + DAY_MAX + ' hoy. ¡Gracias! Mañana puedes mandar más.' : 'Espera ' + lim.wait + ' s antes de mandar otra.', limit: lim.why });
    var d = { kind: o.kind, text: norm(o.text), ver: String(VB.VERSION || ''), ctx: ctxJson(o.kind, { screen: o.screen, mode: o.mode }) };
    if (o.kind === 'bug' && o.where) d.where = o.where;
    var id = newId(), x = { id: id, d: d, at: Date.now(), tries: 1 };
    countSend();
    var drop = function () { setQueue(queue().filter(function (y) { return y.id !== id; })); };
    // la cuenta se decide AHORA (al mandarlo), no al reintentar: un mensaje de la cola nunca sale con la cuenta de otro
    return auth().then(function (a) {
      d.uid = a ? String(a.uid) : '';
      var q = queue(); q.push(x); setQueue(q);   // primero a la cola: si la pestaña se cierra a mitad, no se pierde
      return write(id, d);
    }).then(function (r) {
      if (r === 'ok' || r === 'drop') drop();
      if (r === 'ok') { flush(); return { status: 'sent', msg: '¡Gracias! Enviado', id: id }; }
      if (r === 'drop') return { status: 'error', msg: 'No se ha podido guardar. Prueba con otro texto.' };
      return { status: 'queued', msg: 'Guardado: se enviará en cuanto se pueda', id: id };
    });
  }
  // reintentos: al arrancar (sin estorbar la carga) y al volver la conexión
  if (root.addEventListener) {
    root.addEventListener('online', function () { setTimeout(flush, 1500); });
    var bootT = function () { setTimeout(function () { if (queue().length) flush(); }, 4000); };
    if (root.document && root.document.readyState !== 'complete') root.addEventListener('load', bootT); else bootT();
  }

  /** Dirección del visor (pages/feedback.html): en Pages va junto al index; en el repo, dentro de pages/. */
  function viewerUrl() { return root.__vbBuild ? 'feedback.html' : 'pages/feedback.html'; }

  // ------------------------------------------------------------------ formulario (lo monta ui.js dentro de #pnFb)
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var draft = { sug: '', bug: '' }, M = null;
  var LBL = { sug: '¿Qué mejorarías o qué te gustaría ver en el juego?', bug: '¿Qué ha pasado? Cuenta qué hacías y qué esperabas que pasara.' };
  // (móvil bajo, .ph-s: la pregunta en una línea para que el cuadro quepa en la hoja)
  var LBL_S = { sug: '¿Qué mejorarías?', bug: '¿Qué ha pasado?' };
  var PH = { sug: 'Por ejemplo: que se pueda elegir el balón de la playa', bug: 'Por ejemplo: en la Carrera, al acabar la jornada, se queda la pantalla en negro' };
  var IC = {
    sug: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.1.9 1.8V17h6v-1c0-.7.3-1.3.9-1.8A6.5 6.5 0 0 0 12 2.5zM9 18.5h6V20a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/></svg>',
    bug: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 4.2 7.4 3l1.2-1.2 1.6 1.6a5 5 0 0 1 3.6 0l1.6-1.6L16.6 3l-1.2 1.2A5 5 0 0 1 17 7H7a5 5 0 0 1 1.6-2.8zM6 8.5h12V10h3v1.6h-3v2h3v1.6h-3.1A6 6 0 0 1 12.8 21V11h-1.6v10a6 6 0 0 1-5.1-5.8H3v-1.6h3v-2H3V10h3z"/></svg>'
  };
  function spb(act, label, cls, n, extra) {
    return '<button type="button" class="sp-btn sp-md ' + cls + '" data-shape="' + (n | 0) + '" data-fb="' + act + '"' + (extra || '') + '><span class="sp-t">' + label + '</span></button>';
  }
  /** Pinta el formulario en host (#pnFb). o = {kind, where, screen, mode, back() (cerrar el panel), focus(el, kb), sound(name), kb(), onKind(kind)}. */
  function mount(host, o) {
    if (!host) return false;
    o = o || {};
    M = { host: host, o: o, kind: o.kind === 'bug' ? 'bug' : 'sug', where: o.where && WHERE_IDS.indexOf(o.where) >= 0 ? o.where : '', busy: false, done: null };
    render();
    return true;
  }
  function render() {
    if (!M) return;
    var k = M.kind, h = M.host, d = M.done;
    if (d) {
      h.innerHTML = '<div class="fb sp-panel sp-scroll fb-done" id="fbBody" data-nav>' +
        '<p class="fb-ok' + (d.status === 'queued' ? ' fb-q' : '') + '" role="status">' + esc(d.msg) + '</p>' +
        '<p class="fb-s">' + (d.status === 'queued' ? 'No hemos podido mandarlo ahora. Lo guardamos en este aparato y se manda solo más tarde.' : (k === 'bug' ? 'Lo miraremos para arreglarlo.' : 'Lo leeremos con calma.')) + '</p></div>' +
        '<div class="fb-foot" data-nav data-sp-row>' + spb('close', 'Hecho', 'sp-kit', 2, ' id="fbDone"') + '</div>';
      deco(); return;
    }
    var n = norm(draft[k]).length;
    h.innerHTML =
      '<div class="fb-kind" data-nav data-sp-row data-kb-hide role="radiogroup" aria-label="Qué quieres mandar">' +
        KINDS.map(function (x) { return '<button type="button" class="sp-tab" role="radio" data-fbk="' + x + '" aria-checked="' + (x === k) + '">' + IC[x] + '<span>' + (x === 'sug' ? 'Sugerencia' : 'Bug') + '</span></button>'; }).join('') +
      '</div>' +
      '<div class="fb sp-panel sp-scroll" id="fbBody" data-nav>' +
        '<label class="fb-l" for="fbText"><span class="fb-lf">' + esc(LBL[k]) + '</span><span class="fb-ls" aria-hidden="true">' + esc(LBL_S[k]) + '</span></label>' +
        '<textarea id="fbText" class="fb-t" data-focus rows="4" maxlength="' + MAX + '" spellcheck="true" autocomplete="off" placeholder="' + esc(PH[k]) + '"></textarea>' +
        '<p class="fb-n" id="fbCount" aria-live="off" data-kb-hide>' + n + ' / ' + MAX + '</p>' +
        (k === 'bug' ? '<p class="fb-wl" id="fbWl" data-kb-hide>¿Dónde pasó? <small>(si quieres)</small></p><div class="fb-where" data-sp-row data-kb-hide role="radiogroup" aria-labelledby="fbWl">' +
          WHERE.map(function (w) { return '<button type="button" class="sp-tab" role="radio" data-fbw="' + w[0] + '" aria-checked="' + (M.where === w[0]) + '">' + esc(w[1]) + '</button>'; }).join('') + '</div>' : '') +
        '<p class="fb-att" id="fbAtt" data-kb-hide>' + esc(ctxLine(k, M.o)) + '</p>' +
        '<p class="fb-msg" id="fbMsg" role="status" aria-live="polite"></p>' +
      '</div>' +
      '<div class="fb-foot" data-nav data-sp-row><p class="fb-keys sp-hints" aria-hidden="true"><span class="kh"><span class="key">Ctrl</span> + <span class="key">Intro</span> envía</span>' +
        '<span class="kh"><span class="key">Esc</span> cierra</span></p>' +
        // (movil-aire §5.1: en el móvil «Se adjunta…» va tras esta «i», en la columna de Enviar; .ph-only = no existe en PC)
        '<button type="button" class="sp-q fb-attq ph-only" data-kb-hide aria-label="Qué se manda con tu mensaje" data-q-title="Qué se manda" data-q-src="#fbAtt">i</button>' +
        spb('cancel', 'Cancelar', 'sp-cream', 1, ' id="fbCancel"') + spb('send', 'Enviar', 'sp-kit', 2, ' id="fbSend"') + '</div>';
    var ta = h.querySelector('#fbText');
    ta.value = draft[k];
    ta.addEventListener('input', function () { draft[M.kind] = ta.value; count(); });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') return;                                             // (Tab: siguiente control, ui.js navMove)
      e.stopPropagation();                                                     // que el juego no vea las letras (Q/E, F, i…)
      if (e.key === 'Escape') { e.preventDefault(); if (M && M.o.back) M.o.back(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
    });
    ta.addEventListener('keyup', function (e) { if (e.key !== 'Tab') e.stopPropagation(); });
    if (!h._fbClick) {
      h._fbClick = true;
      h.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || !M || !h.contains(b)) return;
        var kk = b.getAttribute('data-fbk'), w = b.getAttribute('data-fbw'), a = b.getAttribute('data-fb');
        if (kk && kk !== M.kind) { M.kind = kk; snd('tab'); render(); if (M.o.onKind) M.o.onKind(kk); refocus('[data-fbk="' + kk + '"]'); return; }
        if (w) { M.where = M.where === w ? '' : w; snd('click'); [].forEach.call(h.querySelectorAll('[data-fbw]'), function (x) { x.setAttribute('aria-checked', String(x.getAttribute('data-fbw') === M.where)); }); return; }
        if (a === 'send') send();
        else if (a === 'cancel' || a === 'close') { snd('back'); if (M.o.back) M.o.back(); }
      });
    }
    count(); deco();
    try { if (VB.Splat && VB.Splat.info) VB.Splat.info(h); } catch (e) { }
  }
  function deco() { try { if (VB.Splat && VB.Splat.decorate) VB.Splat.decorate(M.host); } catch (e) { } }
  function snd(n) { try { if (M && M.o.sound) M.o.sound(n); } catch (e) { } }
  function refocus(sel) { var b = M && M.host.querySelector(sel); if (b && M.o.focus) M.o.focus(b, !!(M.o.kb && M.o.kb())); }
  function count() {
    var c = M && M.host.querySelector('#fbCount'); if (!c) return;
    var n = norm(draft[M.kind]).length; c.textContent = n + ' / ' + MAX; c.classList.toggle('low', n > 0 && n < MIN);
    c.classList.toggle('near', n >= MAX - 200);   // (móvil: el contador solo sale cerca del límite)
  }
  function say(t, bad) { var m = M && M.host.querySelector('#fbMsg'); if (m) { m.textContent = t || ''; m.classList.toggle('bad', !!bad); } }
  function send() {
    if (!M || M.busy) return;
    var o = { kind: M.kind, text: draft[M.kind], where: M.kind === 'bug' ? M.where : '', screen: M.o.screen, mode: M.o.mode };
    var bad = validate(o); if (bad) { say(bad, true); snd('error'); var ta = M.host.querySelector('#fbText'); if (ta && M.o.focus) M.o.focus(ta, true); return; }
    var lim = canSend(); if (!lim.ok) { say(lim.why === 'dia' ? 'Ya has mandado ' + DAY_MAX + ' hoy. ¡Gracias! Mañana puedes mandar más.' : 'Espera ' + lim.wait + ' s antes de mandar otra.', true); snd('error'); return; }
    M.busy = true; say('Enviando…');
    var sb = M.host.querySelector('#fbSend'); if (sb) sb.disabled = true;
    var mm = M;
    submit(o).then(function (r) {
      if (M !== mm) return;
      M.busy = false;
      if (r.status === 'error') { say(r.msg, true); if (sb) sb.disabled = false; snd('error'); return; }
      draft[M.kind] = ''; M.done = r; snd(r.status === 'sent' ? 'confirm' : 'click');
      render(); refocus('#fbDone');
    });
  }

  VB.Feedback = {
    KINDS: KINDS.slice(), WHERE: WHERE_IDS.slice(), MIN: MIN, MAX: MAX, QKEY: QKEY, LKEY: LKEY,
    mount: mount, submit: submit, flush: flush, validate: validate, canSend: canSend, context: context, ctxLine: ctxLine, viewerUrl: viewerUrl,
    queue: queue, errors: function () { return errs.slice(); },
    /** Título del panel según el tipo elegido ahora mismo. */
    title: function () { return M && M.kind === 'bug' ? 'Avisar de un bug' : 'Tu sugerencia'; },
    kind: function () { return M ? M.kind : ''; },
    // pruebas (tools/feedbacktest.js)
    _setFetch: function (f) { F = f || null; }, _env: env, _ctxJson: ctxJson, _clean: clean, _pushErr: pushErr, _newId: newId,
    _reset: function () { lsSet(QKEY, null); lsSet(LKEY, null); draft.sug = draft.bug = ''; errs.length = 0; }
  };
})();
