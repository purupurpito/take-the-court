/* MAKE THE CUT — js/account.js (owner: ui_main)
 * Cuentas para guardar el progreso en la nube (Firebase, proyecto make-the-cut-vb; diseño en notes/cuentas.md).
 *  - Solo usuario y contraseña (correo ficticio <usuario>@cuentas.make-the-cut.invalid). Firebase por REST, sin librerías.
 *  - Se sincronizan cuatro guardados del navegador: escuadrón ('voley3d.squad'), Carrera ('voley3d.career'), ajustes
 *    ('voley3d.settings') y récord ('voley3d.record'). Cada uno es un documento users/{uid}/saves/{squad|career|settings|record}
 *    = {data: JSON en texto, updatedAt: ms, v: 1}. Sin cifrar (lo eligió Ferran); las reglas solo dejan leer y escribir al dueño.
 *  - No toca el resto del juego: escucha las escrituras de esas claves en localStorage (envuelve Storage.setItem/removeItem),
 *    apunta la hora y sube el cambio a los ~1,5 s (y al ocultar la pestaña). Sin cuenta o sin red, todo sigue en local.
 *  - Al entrar se une lo del dispositivo con lo de la cuenta: gana lo más reciente; si las dos Carreras son distintas, se pregunta.
 *    Si llega algo de la cuenta, la página se recarga para que el juego lo lea.
 *  - 'voley3d.gym' (Entrenamiento) se une por máximo (mergeGym); se sincroniza desde el 12-nov-2026 (GYM_SYNC = true).
 *  - 'voley3d.look' (Vestuario, js/look.js) tiene su fusión escrita (mergeLook: une lo ganado y lo visto con VB.Look.mergeRaw y toma
 *    los looks del lado más reciente) pero NO se sincroniza hasta LOOK_SYNC = true.
 *  - S4 (T13): 'voley3d.profile', 'voley3d.career6', 'voley3d.career.mode', 'voley3d.legends' y 'voley3d.retos' tienen su fusión
 *    (MERGE: perfil y retos con su mergeRaw, Salón de la Fama por unión; Carrera de pista y modo, gana lo más reciente) pero NO se
 *    sincronizan hasta S4_SYNC = true (antes, Ferran despliega firebase/firestore.rules). Hasta entonces, TRACK (solo la hora).
 *  - Conflictos en cola (Carrera y Carrera de pista, la primera vez); antes de pisar una Carrera local, copia en '<clave>.prev'.
 *  - Las bajadas solo se aplican en el menú (fuera, quedan pendientes hasta VB.Account.menuReady()); tras la primera recarga de la
 *    pestaña, las claves con caché llaman a su gancho (Prog._reload, Career.beach/hall._reset) y VB.UI.refreshMenu.
 *  - Tope de subida 390 000 caracteres (las reglas admiten 400 000): lo que pase no se sube hasta su siguiente cambio.
 *  - Panel propio (#account) que se abre con el botón «Cuenta» del menú principal (#btnAcc, lo crea este módulo).
 */
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var FB = { key: 'AIzaSyC59o9QtpUvjWT4g3ouOXinghASTuXZSes', project: 'make-the-cut-vb', mail: '@cuentas.make-the-cut.invalid' };
  var FS = 'https://firestore.googleapis.com/v1/projects/' + FB.project + '/databases/(default)/documents/';
  var SES = 'voley3d.account', META = 'voley3d.account.meta';
  var DOCS = { 'voley3d.squad': 'squad', 'voley3d.career': 'career', 'voley3d.settings': 'settings', 'voley3d.record': 'record' };
  // Entrenamiento (E6, js/gym.js): 'voley3d.gym' se sincronizará como users/{uid}/saves/gym, uniendo por máximo (mergeGym).
  // APAGADO hasta que Ferran despliegue firebase/firestore.rules con 'gym' en la lista de key: antes, cada subida daría 403.
  // Orden obligatorio: 1) desplegar reglas, 2) GYM_SYNC = true. 'voley3d.seen' y 'voley3d.device' NUNCA van a DOCS (son del dispositivo).
  var GYM_SYNC = true;   // reglas con 'gym' desplegadas el 12-nov-2026 (firebase deploy --only firestore:rules)
  if (GYM_SYNC) DOCS['voley3d.gym'] = 'gym';
  // Vestuario (js/look.js): 'voley3d.look' irá a users/{uid}/saves/look con la fusión mergeLook. APAGADO: las reglas con 'look' están en
  // firebase/firestore.rules pero sin desplegar. Orden obligatorio, como con el gym: 1) Ferran despliega las reglas, 2) LOOK_SYNC = true.
  // Mientras tanto se apunta igual la hora de cada escritura (TRACK), para que la primera fusión ya sepa qué looks son los más nuevos.
  var LOOK_SYNC = false;
  if (LOOK_SYNC) DOCS['voley3d.look'] = 'look';
  var TRACK = { 'voley3d.look': 1 };
  if (LOOK_SYNC) delete TRACK['voley3d.look'];
  // S4 (D2/D4, T13): perfil, Carrera de pista, modo de Carrera, Salón de la Fama y retos. APAGADO hasta que Ferran despliegue
  // firebase/firestore.rules (ya tiene las 11 claves). Orden obligatorio: 1) desplegar reglas, 2) S4_SYNC = true (y LOOK_SYNC).
  // Mientras tanto van a TRACK: se apunta la hora de cada escritura sin subir, para que la primera fusión sepa qué es más nuevo.
  // NUNCA van a DOCS ni a TRACK: '<clave>.bak', 'voley3d.career.prev', 'voley3d.career6.prev', 'voley3d.devid', 'voley3d.retostab'.
  var S4_SYNC = false;
  var S4_DOCS = { 'voley3d.profile': 'profile', 'voley3d.career6': 'career6', 'voley3d.career.mode': 'cmode', 'voley3d.legends': 'legends', 'voley3d.retos': 'retos' };
  Object.keys(S4_DOCS).forEach(function (k) { if (S4_SYNC) DOCS[k] = S4_DOCS[k]; else TRACK[k] = 1; });
  // Carreras: la primera vez en un dispositivo, si la local y la de la cuenta son distintas, se pregunta (en cola, una tras otra).
  var CONFLICT = { 'voley3d.career': 'Carrera', 'voley3d.career6': 'Carrera de pista' };
  var MAX_RAW = 390000;   // tope de subida (las reglas admiten 400 000 caracteres)
  var LS = null; try { LS = window.localStorage; } catch (e) { }
  var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;

  function jget(k) { try { return JSON.parse(LS.getItem(k) || 'null'); } catch (e) { return null; } }
  function jset(k, v) { try { if (v == null) rawRemove.call(LS, k); else rawSet.call(LS, k, JSON.stringify(v)); } catch (e) { } }
  var acc = jget(SES); if (acc && !(acc.uid && acc.rt && acc.user)) acc = null;
  var meta = jget(META) || {};          // {clave: ms de la última escritura local}
  var synced = jget(META + '.up') || {}; // {clave: ms subido a la cuenta}
  var applying = false, dirty = {}, pushT = 0, lastSync = 0, status = acc ? 'idle' : 'off', lastErr = '';
  var pendingDown = false, big = {}, conflicts = [];   // big: {clave: meta de la versión demasiado grande (no se reintenta)}

  // ---------------------------------------------------------------- escuchar las escrituras del juego
  if (LS) {
    Storage.prototype.setItem = function (k, v) {
      rawSet.call(this, k, v);
      if (this === LS && !applying) { if (DOCS[k]) touch(k); else if (TRACK[k]) stamp(k); }
    };
    Storage.prototype.removeItem = function (k) {
      rawRemove.call(this, k);
      if (this === LS && !applying) { if (DOCS[k]) touch(k); else if (TRACK[k]) stamp(k); }
    };
  }
  function touch(k) { meta[k] = Date.now(); jset(META, meta); if (acc) { dirty[k] = 1; schedule(); } }
  function stamp(k) { meta[k] = Date.now(); jset(META, meta); }   // solo la hora (clave que aún no se sube)
  function schedule() { clearTimeout(pushT); pushT = setTimeout(function () { push().catch(function () { }); }, 1500); }

  // ---------------------------------------------------------------- Firebase (REST)
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function req(url, opt) {
    var ac = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (ac) ac.abort(); }, 15000);
    if (ac) opt.signal = ac.signal;
    return fetch(url, opt).then(function (r) { clearTimeout(t); return r; }, function () { clearTimeout(t); throw err('unavailable', 'sin conexión'); });
  }
  function idt(path, body) {
    return req('https://identitytoolkit.googleapis.com/v1/' + path + '?key=' + FB.key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var m = String(j.error && j.error.message || ''); throw err(r.status >= 500 || r.status === 429 ? 'unavailable' : m.split(/[ :]/)[0] || 'error', m); }
          return j;
        });
      });
  }
  function token() {
    if (!acc) return Promise.reject(err('unauthenticated'));
    if (acc.it && acc.ie > Date.now() + 60e3) return Promise.resolve(acc.it);
    return req('https://securetoken.googleapis.com/v1/token?key=' + FB.key, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(acc.rt) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) {
            var m = String(j.error && j.error.message || '');
            if (r.status === 400 && /TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND|INVALID_REFRESH_TOKEN/.test(m)) { lost(); throw err('unauthenticated'); }
            throw err('unavailable', m);
          }
          acc.it = j.id_token; acc.rt = j.refresh_token || acc.rt; acc.ie = Date.now() + (+j.expires_in || 3600) * 1000; jset(SES, acc);
          return acc.it;
        });
      });
  }
  function fs(method, path, body, keep) {
    return token().then(function (t) {
      var o = { method: method, headers: { Authorization: 'Bearer ' + t } };
      if (body) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
      if (keep) o.keepalive = true;
      return req(FS + path, o);
    }).then(function (r) {
      if (r.status === 404) return null;
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw err(r.status === 403 ? 'permission_denied' : r.status === 401 ? 'unauthenticated' : r.status >= 500 || r.status === 429 ? 'unavailable' : 'error', j.error && j.error.message);
        return j;
      });
    });
  }
  function docPath(name) { return 'users/' + acc.uid + '/saves/' + name; }
  function readAll() {
    return fs('GET', 'users/' + acc.uid + '/saves?pageSize=50').then(function (j) {
      var out = {};
      ((j && j.documents) || []).forEach(function (d) {
        var f = d.fields || {}, name = d.name.split('/').pop();
        out[name] = { data: f.data ? f.data.stringValue : null, at: f.updatedAt ? +(f.updatedAt.integerValue || f.updatedAt.doubleValue || 0) : 0 };
      });
      return out;
    });
  }
  function writeDoc(k, keep) {
    var at = meta[k] || Date.now(), raw = null;
    try { raw = LS.getItem(k); } catch (e) { }
    if (raw != null && raw.length > MAX_RAW) { big[k] = at; return Promise.reject(err('too_big')); }   // las reglas lo rechazarían
    var body ={ fields: { data: { stringValue: raw == null ? 'null' : raw }, updatedAt: { integerValue: String(at) }, v: { integerValue: '1' } } };
    return fs('PATCH', docPath(DOCS[k]), body, keep).then(function () { synced[k] = at; jset(META + '.up', synced); });
  }
  function push(keep) {
    if (!acc) return Promise.resolve();
    var ks = Object.keys(dirty).filter(function (k) { return !(big[k] && big[k] === meta[k]); });   // (lo demasiado grande espera a su siguiente cambio)
    dirty = {}; if (!ks.length) return Promise.resolve();
    setStatus('busy');
    var fails = [];
    return Promise.all(ks.map(function (k) { return writeDoc(k, keep).catch(function (e) { fails.push({ k: k, e: e }); }); })).then(function () {
      if (!fails.length) { lastSync = Date.now(); setStatus('idle'); return; }
      var e0 = null;
      fails.forEach(function (f) { if (f.e && f.e.code === 'too_big') { if (!e0) e0 = f.e; } else { dirty[f.k] = 1; e0 = f.e; } });   // too_big: fuera de dirty
      setStatus('error', e0);   // (unavailable: se reintenta al volver la red)
    });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') push(true); else if (acc) syncDown(false); });
  window.addEventListener('pagehide', function () { push(true); });
  window.addEventListener('online', function () { if (acc) { markDirty(); push(); } });
  function markDirty() { for (var k in DOCS) if ((meta[k] || 0) > (synced[k] || 0)) dirty[k] = 1; }

  // ---------------------------------------------------------------- unir dispositivo y cuenta
  function score(raw) { // progreso del escuadrón para decidir sin fechas (primera vez en este dispositivo)
    try { var o = JSON.parse(raw), s = 0; (o.a || []).forEach(function (a) { s += (a.lvl || 0) * 1000 + (a.xp || 0) + (a.matches || 0); }); return s; } catch (e) { return 0; }
  }
  function apply(k, raw) {
    applying = true;
    try {
      // Carreras: antes de pisar una local que no está vacía y es distinta, copia del aparato en '<clave>.prev' (nunca sube; se
      // recupera a mano con tools/eval.js)
      if (CONFLICT[k]) { var L0 = LS.getItem(k); if (L0 != null && L0 !== 'null' && L0 !== raw) rawSet.call(LS, k + '.prev', L0); }
      if (raw == null || raw === 'null') rawRemove.call(LS, k); else rawSet.call(LS, k, raw);
    } catch (e) { }
    applying = false;
  }
  // Fusiones propias (lo que no es «gana lo más reciente»). Firma (L, R, remoteNewer) → texto (L tal cual si no cambia nada).
  function modMerge(n) {
    return function (L, R, rn) {
      var M = VB[n]; if (!M || typeof M.mergeRaw !== 'function') return rn ? R : L;
      try { var o = M.mergeRaw(L, R, rn); return typeof o === 'string' ? o : (rn ? R : L); } catch (e) { return rn ? R : L; }
    };
  }
  var MERGE = { 'voley3d.gym': mergeGym, 'voley3d.look': mergeLook, 'voley3d.legends': mergeLegends,
    'voley3d.profile': modMerge('Profile'), 'voley3d.retos': modMerge('Retos') };
  /** Une lo local con lo remoto. first: primera entrada en este dispositivo (sin fechas fiables). Devuelve {changed, keys (claves
   *  cambiadas en local), conflicts:[{k, remote, local, at}], conflict (el primero o null)}. Los conflictos también quedan en la
   *  cola del módulo (los resuelve act('keepRemote'|'keepLocal') uno a uno). */
  function merge(remote, first) {
    var changed = false, keys = [], found = [];
    Object.keys(DOCS).forEach(function (k) {
      var name = DOCS[k], R = remote[name], L = null; try { L = LS.getItem(k); } catch (e) { }
      var Lt = meta[k] || 0;
      var put = function (raw) { apply(k, raw); changed = true; if (keys.indexOf(k) < 0) keys.push(k); };
      if (!R) { if (L != null) dirty[k] = 1; return; }
      var Rd = R.data === 'null' ? null : R.data;
      if (Rd === L) { synced[k] = R.at; return; }
      if (L == null) { put(Rd); meta[k] = R.at; synced[k] = R.at; return; }
      if (Rd == null) { if (first || Lt > R.at) dirty[k] = 1; else { put(null); meta[k] = R.at; } return; }
      if (CONFLICT[k] && first) { found.push({ k: k, remote: Rd, local: L, at: R.at }); return; }
      if (MERGE[k]) {   // gym por máximo, look y retos por unión, perfil conmutativo, Salón de la Fama por unión (top 20)
        var Mx = MERGE[k](L, Rd, first || R.at > Lt);
        if (Mx !== L) put(Mx);
        meta[k] = Math.max(Lt, R.at); synced[k] = R.at;
        if (Mx !== Rd) dirty[k] = 1;
        return;
      }
      var remoteWins = first ? (k === 'voley3d.squad' ? score(Rd) >= score(L) : k !== 'voley3d.record' || recPlayed(Rd) >= recPlayed(L)) : R.at > Lt;
      if (remoteWins) { put(Rd); meta[k] = R.at; synced[k] = R.at; } else dirty[k] = 1;
    });
    jset(META, meta); jset(META + '.up', synced);
    found.forEach(function (c) { conflicts = conflicts.filter(function (x) { return x.k !== c.k; }); conflicts.push(c); });
    return { changed: changed, keys: keys, conflicts: found, conflict: found[0] || null };
  }
  /** Une dos Salones de la Fama ('voley3d.legends', [rec ≤ 20]) por la clave name|num|date; orden por score de mayor a menor, las
   *  20 primeras. Devuelve el local tal cual si no cambia nada. */
  function mergeLegends(Lraw, Rraw) {
    function p(r) { try { var a = JSON.parse(r); return Array.isArray(a) ? a.filter(function (x) { return x && typeof x === 'object'; }) : null; } catch (e) { return null; } }
    var A = p(Lraw), B = p(Rraw);
    if (!B) return Lraw != null ? Lraw : Rraw;
    if (!A) return Rraw;
    var by = {}, out = [], added = false;
    A.concat(B).forEach(function (r, i) { var id = String(r.name) + '|' + String(r.num) + '|' + String(r.date); if (!by[id]) { by[id] = 1; out.push(r); if (i >= A.length) added = true; } });
    if (!added && A.length <= 20) return Lraw;   // el remoto no trae nada nuevo
    out.sort(function (a, b) {
      var d = (+b.score || 0) - (+a.score || 0); if (d) return d;
      var ka = String(a.name) + '|' + String(a.num) + '|' + String(a.date), kb = String(b.name) + '|' + String(b.num) + '|' + String(b.date);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    out = out.slice(0, 20);
    var txt = JSON.stringify(out);
    return txt === JSON.stringify(A) ? Lraw : txt;
  }
  /** Une dos guardados de 'voley3d.gym' (texto JSON) por máximo: por ejercicio b (récord, con su fecha t), m (medalla),
   *  n (intentos) y xp (nivel ya cobrado); free.rally. Devuelve texto JSON (el local tal cual si no cambia nada). */
  function mergeGym(Lraw, Rraw) {
    function p(r) { try { var o = JSON.parse(r); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
    function n(v) { v = +v; return isFinite(v) && v > 0 ? v : 0; }
    var A = p(Lraw), B = p(Rraw), out = { v: Math.max(n(A.v), n(B.v), 1), d: {}, free: { rally: 0 }, xp: {} };
    var Ad = A.d || {}, Bd = B.d || {}, Ax = A.xp || {}, Bx = B.xp || {};
    ['serve', 'recv', 'set', 'atk', 'block'].forEach(function (id) {
      var a = Ad[id], b = Bd[id];
      if (a || b) {
        a = a || {}; b = b || {};
        var ab = n(a.b), bb = n(b.b);
        out.d[id] = { b: Math.max(ab, bb), m: Math.max(n(a.m), n(b.m)), n: Math.max(n(a.n), n(b.n)),
          t: ab > bb ? n(a.t) : bb > ab ? n(b.t) : Math.min(n(a.t) || n(b.t), n(b.t) || n(a.t)) };
      }
      var x = Math.max(n(Ax[id]), n(Bx[id])); if (x) out.xp[id] = x;
    });
    out.free.rally = Math.max(n(A.free && A.free.rally), n(B.free && B.free.rally));
    var txt = JSON.stringify(out);
    return Lraw != null && txt === JSON.stringify(p(Lraw)) ? Lraw : txt;
  }
  /** Une dos guardados de 'voley3d.look' (texto JSON {v, fits, own, seen}). own y seen: unión con VB.Look.mergeRaw (gana la t mínima);
   *  fits: los del lado más reciente por la hora de meta (remoteNewer), los dé como los dé mergeRaw. Sin js/look.js (o con un mergeRaw
   *  que falla) gana entero el más reciente. Devuelve texto JSON (el local tal cual si no cambia nada). look.js sanea al cargar. */
  function mergeLook(Lraw, Rraw, remoteNewer) {
    function p(r) { try { var o = JSON.parse(r); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; } }
    var A = p(Lraw), B = p(Rraw);
    if (!B) return Lraw != null ? Lraw : Rraw;
    if (!A) return Rraw;
    var out = null, Lk = VB.Look;
    if (Lk && typeof Lk.mergeRaw === 'function') { try { out = p(Lk.mergeRaw(Lraw, Rraw)); } catch (e) { out = null; } }
    if (!out) return remoteNewer ? Rraw : Lraw;
    var src = remoteNewer ? B : A;
    if (Array.isArray(src.fits)) out.fits = src.fits;
    var txt = JSON.stringify(out);
    return txt === JSON.stringify(A) ? Lraw : txt;
  }
  function recPlayed(raw) { try { return +(JSON.parse(raw).played) || 0; } catch (e) { return 0; } }
  function reloadSoon(msg) {
    try { sessionStorage.setItem('voley3d.account.toast', msg); } catch (e) { }
    setTimeout(function () { location.reload(); }, 350);
  }
  function inMenu() { var c = VB.ctx; return !c || !c.state || c.state === 'menu'; }
  /** Al abrir el juego (y al volver a la pestaña) con sesión: baja lo que haya cambiado en otro dispositivo. Solo en el menú: en un
   *  partido (o en cualquier otro estado) se deja pendiente y la lanza menuReady() (si no, los módulos con caché seguirían con lo
   *  viejo y su siguiente save() pisaría lo que llegó). */
  function syncDown(atBoot) {
    if (!acc) return Promise.resolve();
    if (!inMenu()) { pendingDown = true; return Promise.resolve(); }
    pendingDown = false;
    setStatus('busy');
    return readAll().then(function (remote) {
      var r = merge(remote, false);
      lastSync = Date.now(); setStatus('idle'); push();
      if (r.changed) afterDown(r.keys);
    }, function (e) { setStatus('error', e); });
  }
  // Ganchos de las claves con caché en memoria (tras la primera recarga de la pestaña se llaman en vez de recargar otra vez).
  var HOOKS = {
    'voley3d.squad': function () { if (VB.Prog && VB.Prog._reload) VB.Prog._reload(); },
    'voley3d.career': function () { var b = VB.Career && VB.Career.beach; if (b && b._reset) b._reset(); },
    'voley3d.career6': function () { var h = VB.Career && VB.Career.hall; if (h && h._reset) h._reset(); }
    // gym, look, profile y retos leen el texto cada vez (o cachean por el texto): no necesitan gancho
  };
  function afterDown(keys) {
    keys = keys || [];
    if (!reloadedOnce()) { reloadSoon('Progreso actualizado desde tu cuenta'); return 'reload'; }
    if (keys.indexOf('voley3d.settings') >= 0 && reloadCount() < 3) { reloadSoon('Ajustes actualizados desde tu cuenta'); return 'reload'; }
    keys.forEach(function (k) { if (HOOKS[k]) { try { HOOKS[k](); } catch (e) { } } });
    try { if (VB.UI && VB.UI.refreshMenu) VB.UI.refreshMenu(); } catch (e) { }
    return 'hooks';
  }
  function reloadedOnce() { try { if (sessionStorage.getItem('voley3d.account.rl')) return true; sessionStorage.setItem('voley3d.account.rl', '1'); } catch (e) { } return false; }
  function reloadCount() {   // recargas por ajustes en esta pestaña (tope, para que nunca haya bucle)
    var n = 0; try { n = +sessionStorage.getItem('voley3d.account.rls') || 0; sessionStorage.setItem('voley3d.account.rls', String(n + 1)); } catch (e) { n = 9; }
    return n;
  }
  /** Lo llama ui.js al entrar en el menú: lanza la bajada que quedó pendiente durante un partido. */
  function menuReady() { if (pendingDown && acc && inMenu()) return syncDown(false); return Promise.resolve(); }

  // ---------------------------------------------------------------- entrar, crear, salir, borrar
  function normUser(u) { return String(u || '').trim().toLowerCase(); }
  function userOk(u) { return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(u); }
  function enter(user, pass, create) {
    user = normUser(user);
    if (!userOk(user)) return Promise.reject(err('bad_user'));
    if (String(pass || '').length < 6) return Promise.reject(err('WEAK_PASSWORD'));
    return idt(create ? 'accounts:signUp' : 'accounts:signInWithPassword', { email: user + FB.mail, password: pass, returnSecureToken: true })
      .then(function (j) {
        acc = { user: user, uid: j.localId, rt: j.refreshToken, it: j.idToken, ie: Date.now() + (+j.expiresIn || 3600) * 1000 };
        jset(SES, acc); synced = {}; jset(META + '.up', synced); conflicts = [];
        return readAll();
      }).then(function (remote) {
        var r = merge(remote, true);
        return push().then(function () { lastSync = Date.now(); setStatus('idle'); return r; });
      });
  }
  function signOut() { acc = null; dirty = {}; jset(SES, null); setStatus('off'); }
  function lost() { acc = null; jset(SES, null); setStatus('off'); toast('Se ha cerrado la sesión de tu cuenta. Vuelve a entrar desde «Cuenta».'); }
  function deleteAccount() {
    if (!acc) return Promise.resolve();
    // todos los documentos que lista la cuenta (también los de versiones más nuevas o más viejas), y además los de DOCS
    return readAll().catch(function () { return {}; }).then(function (remote) {
      var names = Object.keys(remote || {});
      Object.keys(DOCS).forEach(function (k) { if (names.indexOf(DOCS[k]) < 0) names.push(DOCS[k]); });
      return Promise.all(names.map(function (n) { return fs('DELETE', docPath(n)).catch(function () { }); }));
    })
      .then(function () { return token(); })
      .then(function (t) { return idt('accounts:delete', { idToken: t }); })
      .then(function () { signOut(); });
  }
  function errText(e) {
    var c = e && e.code || '';
    if (c === 'bad_user') return 'El usuario debe tener entre 3 y 30 letras o números (también . _ -), sin espacios.';
    if (c === 'WEAK_PASSWORD') return 'La contraseña debe tener al menos 6 caracteres.';
    if (c === 'EMAIL_EXISTS') return 'Ese usuario ya existe. Si es tuyo, pulsa «Entrar».';
    if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL/.test(c)) return 'Usuario o contraseña incorrectos.';
    if (c === 'TOO_MANY_ATTEMPTS_TRY_LATER') return 'Demasiados intentos. Espera un poco y vuelve a probar.';
    if (c === 'unavailable') return 'No hay conexión. Prueba otra vez en un momento.';
    if (c === 'too_big') return 'Tu Carrera es demasiado grande para la nube';
    return 'No se ha podido completar. Prueba otra vez.';
  }

  // ---------------------------------------------------------------- estado y avisos
  var listeners = [];
  function setStatus(s, e) { status = acc ? s : 'off'; lastErr = e ? errText(e) : ''; listeners.forEach(function (f) { try { f(status); } catch (x) { } }); refreshBtn(); if (root && !root.hidden && view === 'in') render(); }
  var toastT = 0;
  function toast(msg) {
    var t = document.getElementById('accToast');
    if (!t) { t = document.createElement('div'); t.id = 'accToast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3500);
  }

  // ---------------------------------------------------------------- panel y botón
  var CSS = '#account{position:fixed;inset:0;z-index:190;display:flex;align-items:center;justify-content:center;padding:calc(10px + var(--st,0px)) calc(10px + var(--sr,0px)) calc(10px + var(--sbm,0px)) calc(10px + var(--sl,0px));background:rgba(12,8,24,.72);font-family:var(--ui,system-ui,sans-serif)}' +
    '#account[hidden],#accToast[hidden]{display:none}' +
    '#account .ac-sheet{position:relative;width:min(440px,100%);max-height:100%;overflow:auto;padding:18px 20px 16px;border-radius:18px;background:var(--tp,#2b2547);color:var(--fg,#f7f2ea);box-shadow:inset 0 0 0 2.5px var(--tk,#1d1530),5px 6px 0 var(--tk,#1d1530);text-align:left}' +
    '#account h2{margin:0 44px 6px 0;font:900 28px/1 var(--display,sans-serif);letter-spacing:.03em;text-transform:uppercase}' +
    '#account .ac-k{margin:0 0 4px;font:800 11px var(--display,sans-serif);letter-spacing:.3em;text-transform:uppercase;color:var(--gold,#ffd23f)}' +
    '#account p{margin:0 0 10px;font-size:14px;line-height:1.4;color:var(--fg2,#dfe6ef)}' +
    '#account .ac-tabs{display:flex;gap:6px;margin:4px 0 12px;padding:4px;border-radius:12px;background:rgba(0,0,0,.22)}' +
    '#account .ac-tabs button{flex:1;min-height:40px;border:0;border-radius:9px;background:transparent;color:var(--fg2,#dfe6ef);font:800 15px var(--display,sans-serif);letter-spacing:.08em;text-transform:uppercase;cursor:pointer}' +
    '#account .ac-tabs button[aria-selected=true]{background:var(--gold,#ffd23f);color:var(--tk,#1d1530);box-shadow:0 0 0 2px var(--tk,#1d1530)}' +
    '#account label{display:block;margin:0 0 4px;font:800 11px var(--display,sans-serif);letter-spacing:.24em;text-transform:uppercase;color:var(--gold,#ffd23f)}' +
    '#account input{width:100%;box-sizing:border-box;height:46px;margin:0 0 10px;padding:0 12px;border:0;border-radius:11px;background:rgba(0,0,0,.3);color:#fff;font:600 17px var(--ui,system-ui,sans-serif);box-shadow:inset 0 0 0 2px rgba(255,255,255,.12)}' +
    '#account input:focus{outline:none;box-shadow:inset 0 0 0 2.5px var(--gold,#ffd23f)}' +
    '#account .ac-warn{padding:8px 10px;border-radius:10px;background:rgba(255,178,56,.12);box-shadow:inset 0 0 0 1.5px rgba(255,178,56,.4);font-size:13px}' +
    '#account .ac-err{color:#ff9b8a;font-weight:700;min-height:1em}' +
    '#account .ac-acts{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;margin-top:6px}' +
    '#account .ac-acts button,#account .ac-row button{min-height:44px;padding:0 16px;border:0;border-radius:12px;font:800 16px var(--display,sans-serif);letter-spacing:.06em;text-transform:uppercase;cursor:pointer;color:#fff;background:var(--tp2,#352d5c);box-shadow:inset 0 0 0 2px var(--tk,#1d1530),3px 4px 0 var(--tk,#1d1530)}' +
    '#account .pri{background:var(--pri,linear-gradient(180deg,#ff8040 0 50%,#f65d1d 50% 100%))!important}' +
    '#account .dan{background:var(--bad-d,#a8283a)!important}' +
    '#account .ac-x{position:absolute;top:10px;right:10px;width:44px;height:44px;border:0;border-radius:12px;background:transparent;color:var(--fg,#fff);font-size:26px;line-height:1;cursor:pointer}' +
    '#account .ac-user{display:flex;align-items:center;gap:12px;margin:6px 0 12px;padding:10px 12px;border-radius:14px;background:rgba(0,0,0,.2)}' +
    '#account .ac-av{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:#1cc4b4;color:var(--tk,#1d1530);font:900 24px var(--display,sans-serif);box-shadow:0 0 0 2.5px var(--tk,#1d1530)}' +
    '#account .ac-user b{display:block;font:900 20px var(--display,sans-serif);letter-spacing:.04em}' +
    '#account .ac-user small{color:var(--muted,#93a4b9);font-size:13px}' +
    '#account .ac-row{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0}' +
    '#account .ac-choice{display:grid;gap:10px;margin:8px 0}' +
    '#account .ac-choice button{text-align:left;min-height:56px;padding:8px 14px;border:0;border-radius:12px;color:#fff;background:var(--tp2,#352d5c);box-shadow:inset 0 0 0 2px var(--tk,#1d1530),3px 4px 0 var(--tk,#1d1530);font:600 14px var(--ui,system-ui,sans-serif);cursor:pointer}' +
    '#account .ac-choice b{display:block;font:900 17px var(--display,sans-serif);letter-spacing:.05em;text-transform:uppercase;color:var(--gold,#ffd23f)}' +
    '#btnAcc .ac-dot{width:9px;height:9px;border-radius:50%;background:var(--muted,#93a4b9);box-shadow:0 0 0 1.5px var(--tk,#1d1530)}' +
    '#btnAcc.on .ac-dot{background:#1cc4b4}#btnAcc.busy .ac-dot{background:var(--gold,#ffd23f)}#btnAcc.err .ac-dot{background:#ff6a5a}#btnAcc:not(.on):not(.busy):not(.err) .ac-dot{display:none}' +
    '@media (max-height:460px){#account .ac-sheet{padding:10px 16px 12px}#account h2{font-size:22px}#account .ac-intro{display:none}#account .ac-tabs{margin:2px 0 8px}#account .ac-tabs button{min-height:36px}#account input{height:40px;margin-bottom:6px}#account .ac-warn{font-size:12px;padding:6px 8px;margin-bottom:4px}}' +
    '#accToast{position:fixed;left:50%;bottom:calc(18px + var(--sbm,0px));transform:translateX(-50%);z-index:195;max-width:calc(100% - 32px);padding:10px 16px;border-radius:12px;background:var(--tp,#2b2547);color:var(--fg,#fff);font:700 14px var(--ui,system-ui,sans-serif);box-shadow:inset 0 0 0 2px var(--tk,#1d1530),4px 5px 0 var(--tk,#1d1530);pointer-events:none}';
  var root = null, view = 'enter', tab = 'in', busy = false, msg = '', pending = null, lastFocus = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function build() {
    if (root) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'account'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'acTitle');
    root.addEventListener('click', function (e) { if (e.target === root && !busy && view !== 'conflict') close(); e.stopPropagation(); });
    root.addEventListener('keydown', function (e) {
      e.stopPropagation(); // que el menú de detrás no reciba las teclas mientras se escribe
      if (e.key === 'Escape' && !busy && view !== 'conflict') { e.preventDefault(); close(); }
    });
    root.addEventListener('keyup', function (e) { e.stopPropagation(); });
    document.body.appendChild(root);
  }
  function ago(t) {
    if (!t) return 'todavía no';
    var s = Math.round((Date.now() - t) / 1000);
    return s < 10 ? 'ahora mismo' : s < 60 ? 'hace ' + s + ' s' : s < 3600 ? 'hace ' + Math.round(s / 60) + ' min' : 'hace ' + Math.round(s / 3600) + ' h';
  }
  function careerInfo(raw) {
    try {
      var c = JSON.parse(raw), p = c.player || {}, k = c.clubs && c.myClub >= 0 ? c.clubs[c.myClub] : null, club = k && k.name || '';
      var bits = [];
      if (p.name) bits.push(p.name);
      if (c.season) bits.push('temporada ' + c.season);
      if (typeof club === 'string' && club) bits.push(club);
      if (p.lvl) bits.push('nivel ' + p.lvl);
      return bits.join(', ') || 'Carrera guardada';
    } catch (e) { return 'Carrera guardada'; }
  }
  function render() {
    var h = '<div class="ac-sheet"><button class="ac-x" data-ac="close" aria-label="Cerrar"' + (busy || view === 'conflict' ? ' hidden' : '') + '>✕</button>';
    if (view === 'conflict' && pending) {
      var cn = CONFLICT[pending.k] || 'Carrera';
      h += '<p class="ac-k">Tu cuenta</p><h2 id="acTitle">¿Qué ' + esc(cn) + ' te quedas?</h2>' +
        '<p>Tienes una ' + esc(cn) + ' en este dispositivo y otra distinta en tu cuenta. Elige con cuál seguir: la otra se perderá.</p>' +
        '<div class="ac-choice"><button data-ac="keepRemote"><b>La de la cuenta</b>' + esc(careerInfo(pending.remote)) + '</button>' +
        '<button data-ac="keepLocal"><b>La de este dispositivo</b>' + esc(careerInfo(pending.local)) + '</button></div>';
    } else if (acc) {
      var st = status === 'busy' ? 'Sincronizando…' : status === 'error' ? (lastErr || 'Sin conexión') + ' Se reintentará solo.' : 'Guardado en la nube ' + ago(lastSync);
      h += '<p class="ac-k">Tu cuenta</p><h2 id="acTitle">Cuenta</h2>' +
        '<div class="ac-user"><span class="ac-av" aria-hidden="true">' + esc(acc.user.charAt(0).toUpperCase()) + '</span><span><b>' + esc(acc.user) + '</b><small>' + esc(st) + '</small></span></div>' +
        '<p>Tu progreso (jugadores, Carreras, perfil, vestuario, récord y ajustes) se guarda solo en tu cuenta. Entra con el mismo usuario en otro dispositivo para seguir donde lo dejaste.</p>' +
        '<div class="ac-row"><button data-ac="sync">Sincronizar ahora</button><button data-ac="out">Cerrar sesión</button></div>' +
        (view === 'del' ? '<p class="ac-warn">¿Seguro? Se borra la cuenta y lo guardado en ella, y no se puede deshacer. Lo de este dispositivo se queda.</p><div class="ac-acts"><button data-ac="cancel">No, volver</button><button class="dan" data-ac="delYes">Sí, borrar la cuenta</button></div>'
          : '<div class="ac-acts"><button class="dan" data-ac="del">Borrar la cuenta</button><button class="pri" data-ac="close">Hecho</button></div>');
    } else {
      var create = tab === 'new';
      h += '<p class="ac-k">Guarda tu progreso</p><h2 id="acTitle">Cuenta</h2>' +
        '<p class="ac-intro">Con una cuenta, tus jugadores, tu Carrera y tus ajustes se guardan en la nube y los tienes en cualquier dispositivo.</p>' +
        '<div class="ac-tabs" role="tablist"><button role="tab" data-ac="tabIn" aria-selected="' + !create + '">Entrar</button><button role="tab" data-ac="tabNew" aria-selected="' + create + '">Crear cuenta</button></div>' +
        '<form id="acForm" autocomplete="on" novalidate><label for="acUser">Usuario</label><input id="acUser" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="30" required>' +
        '<label for="acPass">Contraseña</label><input id="acPass" name="password" type="password" autocomplete="' + (create ? 'new-password' : 'current-password') + '" minlength="6" required>' +
        (create ? '<p class="ac-warn">No pedimos correo, así que <b>si olvidas la contraseña no se puede recuperar</b>. Apúntala en un sitio seguro.</p>' : '') +
        '<p class="ac-err" role="alert">' + esc(msg) + '</p>' +
        '<div class="ac-acts"><button type="button" data-ac="close">Ahora no</button><button class="pri" type="submit"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Un momento…' : create ? 'Crear cuenta' : 'Entrar') + '</button></div></form>';
    }
    h += '</div>';
    var u = root.querySelector('#acUser'), keepU = u ? u.value : '', keepP = root.querySelector('#acPass') ? root.querySelector('#acPass').value : '';
    root.innerHTML = h;
    if (root.querySelector('#acUser')) { root.querySelector('#acUser').value = keepU; root.querySelector('#acPass').value = keepP; }
    root.querySelectorAll('[data-ac]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); act(b.getAttribute('data-ac')); }); });
    var f = root.querySelector('#acForm');
    if (f) f.addEventListener('submit', function (e) { e.preventDefault(); e.stopPropagation(); act('submit'); });
  }
  function act(a) {
    if (busy && a !== 'close') return;
    if (a === 'close') { if (!busy) close(); return; }
    if (a === 'tabIn' || a === 'tabNew') { tab = a === 'tabNew' ? 'new' : 'in'; msg = ''; render(); focusFirst(); return; }
    if (a === 'submit') {
      var u = root.querySelector('#acUser').value, p = root.querySelector('#acPass').value;
      busy = true; msg = ''; render();
      enter(u, p, tab === 'new').then(function (r) {
        busy = false;
        r.created = tab === 'new';
        if (conflicts.length) { pending = conflicts[0]; pendRes = { remote: false, enter: r }; view = 'conflict'; render(); return; }
        view = 'in'; render();
        if (r.changed) reloadSoon(tab === 'new' ? 'Cuenta creada' : 'Has entrado: progreso cargado desde tu cuenta');
        else toast(tab === 'new' ? 'Cuenta creada: tu progreso ya se guarda en la nube' : 'Has entrado en tu cuenta');
      }, function (e) { busy = false; if (acc && e.code !== 'unauthenticated') { view = 'in'; } msg = errText(e); render(); });
      return;
    }
    if (a === 'keepRemote' || a === 'keepLocal') { resolve(a); return; }
    if (a === 'sync') { markDirty(); busy = true; render(); syncDown(false).then(function () { busy = false; render(); }); return; }
    if (a === 'out') { signOut(); view = 'enter'; tab = 'in'; render(); toast('Sesión cerrada. Tu progreso sigue en este dispositivo.'); return; }
    if (a === 'del') { view = 'del'; render(); return; }
    if (a === 'cancel') { view = 'in'; render(); return; }
    if (a === 'delYes') {
      busy = true; render();
      deleteAccount().then(function () { busy = false; view = 'enter'; render(); toast('Cuenta borrada'); }, function (e) { busy = false; view = 'in'; lastErr = errText(e); render(); });
    }
  }
  /** Resuelve el primer conflicto de la cola; si quedan, pinta el siguiente. Al acabar: recarga si alguno fue keepRemote (o si la
   *  entrada ya trajo cambios); si no, aviso. Devuelve 'next' | 'reload' | 'done' | null. */
  var pendRes = { remote: false, enter: null };
  function resolve(a) {
    var p2 = conflicts.shift() || pending; if (!p2) return null;
    if (a === 'keepRemote') { apply(p2.k, p2.remote); meta[p2.k] = p2.at; synced[p2.k] = p2.at; jset(META, meta); jset(META + '.up', synced); pendRes.remote = true; }
    else { meta[p2.k] = Date.now(); jset(META, meta); dirty[p2.k] = 1; push(); }
    if (conflicts.length) { pending = conflicts[0]; view = 'conflict'; if (root) render(); return 'next'; }
    pending = null; view = 'in'; if (root) render();
    var er = pendRes.enter, rem = pendRes.remote; pendRes = { remote: false, enter: null };
    if (rem || (er && er.changed)) { reloadSoon(rem ? 'Carrera cargada desde tu cuenta' : 'Has entrado: progreso cargado desde tu cuenta'); return 'reload'; }
    toast(p2.k === 'voley3d.career6' ? 'Te quedas con la Carrera de pista de este dispositivo' : 'Te quedas con la Carrera de este dispositivo');
    return 'done';
  }
  function focusFirst() { try { var i = root.querySelector('#acUser') || root.querySelector('[data-ac=close]'); if (i) i.focus({ preventScroll: true }); } catch (e) { } }
  function open() {
    build(); view = acc ? 'in' : 'enter'; msg = ''; render();
    lastFocus = document.activeElement; root.hidden = false; focusFirst();
  }
  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    try { if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } catch (e) { }
  }
  function isOpen() { return !!(root && !root.hidden); }

  // botón «Cuenta» del menú principal (debajo de «Pantalla completa»; solo en la página principal del menú)
  var btn = null;
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4"/><path d="M4.5 20c1.2-4 4-5.6 7.5-5.6s6.3 1.6 7.5 5.6"/></svg>';
  function refreshBtn() {
    if (!btn) return;
    btn.querySelector('span').textContent = acc ? acc.user : 'Cuenta';
    btn.classList.toggle('on', !!acc); btn.classList.toggle('busy', status === 'busy'); btn.classList.toggle('err', status === 'error');
    btn.setAttribute('aria-label', acc ? 'Cuenta: ' + acc.user : 'Cuenta: guarda tu progreso');
    btn.title = acc ? 'Sesión iniciada' : 'Sin sesión';
  }
  function placeBtn() {
    if (!btn) return;
    var page = VB.UI && VB.UI.menuPage ? VB.UI.menuPage() : 'main';
    btn.hidden = page !== 'main' || !!(VB.ctx && VB.ctx.debug);
    var fsb = document.getElementById('btnFs');
    if (fsb && !fsb.hidden) btn.style.top = (fsb.offsetTop + fsb.offsetHeight + 8) + 'px'; else btn.style.top = '';
  }
  function initBtn() {
    var menu = document.getElementById('menu'); if (!menu || btn) return;
    btn = document.createElement('button'); btn.id = 'btnAcc'; btn.className = 'fs-btn'; btn.setAttribute('data-ui', '');
    btn.innerHTML = ICON + '<span>Cuenta</span><i class="ac-dot" aria-hidden="true"></i>';
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(); });
    var fsb = document.getElementById('btnFs');
    if (fsb && fsb.parentNode === menu) menu.insertBefore(btn, fsb.nextSibling); else menu.appendChild(btn);
    refreshBtn(); placeBtn(); setInterval(placeBtn, 700);
  }

  function boot() {
    build(); initBtn();
    try { var t = sessionStorage.getItem('voley3d.account.toast'); if (t) { sessionStorage.removeItem('voley3d.account.toast'); setTimeout(function () { toast(t); }, 900); } } catch (e) { }
    if (acc) syncDown(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  VB.Account = {
    open: open, close: close, isOpen: isOpen, user: function () { return acc ? acc.user : null; }, status: function () { return status; },
    sync: function () { return syncDown(false); }, signOut: signOut, onChange: function (f) { listeners.push(f); },
    // pruebas (tools/cuentatest.js): entrar sin la interfaz y borrar la cuenta al acabar
    menuReady: menuReady, S4_SYNC: S4_SYNC,
    _enter: enter, _delete: deleteAccount, _mergeGym: mergeGym, _gymSync: GYM_SYNC, _mergeLook: mergeLook, _lookSync: LOOK_SYNC, _push: function () { markDirty(); return push(); },
    // pruebas (tools/synctest.js)
    _merge: merge, _docs: function () { return Object.assign({}, DOCS); }, _track: function () { return Object.assign({}, TRACK); },
    _mergeLegends: mergeLegends, _s4Sync: S4_SYNC, _conflicts: function () { return conflicts.slice(); }, _resolve: resolve,
    _pendingDown: function () { return pendingDown; }, _afterDown: afterDown, _MAX_RAW: MAX_RAW,
    _careerInfo: careerInfo, _lastErr: function () { return lastErr; },
    // capturas (tools/eval.js): pinta la cola de conflictos dada [{k, remote, local, at}] sin tocar la nube
    _showConflicts: function (list) { conflicts = (list || []).slice(); if (!conflicts.length) return false; build(); pending = conflicts[0]; pendRes = { remote: false, enter: null }; view = 'conflict'; render(); lastFocus = document.activeElement; root.hidden = false; return true; }
  };
})();
