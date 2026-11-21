/* =====================================================================
 * TAKE THE COURT — js/migrate.js   (owner: ui_main; diseño en notes/dominio.md)
 * Traspaso de partidas al cambiar de casa (1.20.0): el juego se llamaba «Make the Cut» y vivía en purupurpito.github.io/make-the-cut/;
 * ahora es «Take the Court» en https://takethecourt.com/. localStorage es de cada ORIGEN, así que las partidas no pasan solas: la
 * página puente (bridge/index.html, servida en la dirección antigua) lee las claves 'make-the-cut.*', las empaqueta y salta aquí con
 * #mig=<paquete>. Este script (el PRIMERO tras el bloque 'voley3d.*' de index.html, antes que ningún módulo) las mete en este origen.
 *   - Paquete: mig=1.<fmt>.<sha>.<datos>. fmt z = deflate (CompressionStream 'deflate', formato zlib) + base64url; fmt j = JSON en
 *     UTF-8 + base64url. sha = 16 primeras cifras hex del SHA-256 del texto JSON ('0' si el navegador viejo no pudo calcularlo).
 *     JSON = {v:1, from:'make-the-cut', keys:{clave: texto}} (sin hora desde 1.20.0: el mismo guardado da el mismo sha; si llega «at», se lee).
 *   - Al cargar: quita #mig del enlace al momento (history.replaceState, se conserva ?sala= y el resto del hash), guarda el paquete en
 *     sessionStorage 'make-the-cut.mig.raw' (si la pestaña se recarga a medias, se retoma) y descomprime/comprueba en asíncrono.
 *   - Comprobaciones (cualquier fallo rechaza el paquete ENTERO, en silencio, con console.warn): tamaños (LIM), base64url, deflate
 *     con tope (contra bombas), UTF-8, sha, JSON, ≤ 200 claves que casan /^make-the-cut\.[A-Za-z0-9_.-]{1,80}$/ con valores texto
 *     ≤ 2 M caracteres. Se descartan sin rechazar: mig.*, migbak.*, account.gredir, account.rl*.
 *   - Confianza: se trae solo si document.referrer es https://purupurpito.github.io (el puente pone <meta name=referrer content=origin>)
 *     o, con el juego en localhost, otro localhost (pruebas), y el sha cuadra. Si no, hoja SPLAT «¿Traer la partida de Make the Cut?».
 *     Sin confianza NUNCA se trae la sesión de la cuenta ('make-the-cut.account': evita que un enlace te meta en la cuenta de otro).
 *   - Idempotente: 'make-the-cut.mig.done' guarda los 5 últimos sha traídos; uno repetido no hace nada. El puente no mete la hora en
 *     el paquete (1.20.0): el mismo guardado de la dirección antigua da siempre el mismo sha.
 *   - Fusión por clave (con lo que había en ESTE origen al cargar, foto tomada antes que ningún módulo escriba). «Primer traspaso» =
 *     mig.done vacío: lo de aquí es lo poco jugado antes de pasar por el puente y las horas no valen (lo recién creado es «más nuevo»).
 *       no está aquí → se escribe (salvo, fuera del primer traspaso, si aquí se BORRÓ después: hora de aquí más nueva → skipped) ·
 *       igual → nada · 'account.meta' → máximo por clave (sin horas del futuro) · 'account.meta.up' → solo si se trajo la sesión ·
 *       claves del dispositivo (DEVICE) → se queda la de aquí · con fusión de la cuenta (gym, look, legends, profile, retos) →
 *       VB.Account.mergeKey · escuadrón y récord → el de más progreso (score / partidos, como la primera entrada en la cuenta) ·
 *       Carreras distintas → hoja «¿Qué Carrera te quedas?» · el resto → en el primer traspaso la traída; luego, la más reciente por
 *       la hora de 'account.meta' (empate: la de aquí).
 *     Sesión de la cuenta: solo con confianza, si aquí no hay ninguna, en el primer traspaso y sin 'account.out' (cerraste sesión aquí).
 *     Lo que se pisa se copia antes en 'make-the-cut.migbak.<id>.<resto>' (id: 8 cifras del sha de ESTE traspaso; no '<clave>.bak', que
 *     ya usan los módulos); lo traído que pierde queda en 'make-the-cut.migbak.<id>.in.<resto>'. Las Carreras que pierden van además a
 *     '<clave>.prev' (como account.js); si ya había otra '.prev' distinta, antes a migbak. Si una copia no cabe (cuota), esa clave no se toca.
 *   - Se escribe con el Storage.prototype.setItem ORIGINAL (capturado antes de que account.js lo envuelva). Luego: aviso «Partida traída
 *     de Make the Cut» (sessionStorage 'make-the-cut.account.toast', lo enseña account.js), 'make-the-cut.mig.first' y UNA recarga.
 *   - Con la cuenta: mientras hay traspaso pendiente account.js no sincroniza (VB.Migrate.pending() / whenDone(fn)); tras la recarga, con
 *     'mig.first', la primera sincronización une con la nube como la primera entrada en un dispositivo (merge(remote, true): progreso,
 *     no horas; Carreras distintas → los avisos de conflicto de la cuenta). Entrar en la cuenta (begin) hace lo mismo y borra la marca.
 *   - Plan B manual (paquete demasiado grande para un enlace, app instalada en iPhone…): #migcode, #migfile o Ajustes › Info › «Traer tu
 *     partida» (VB.Migrate.manual). Archivo/código admiten valores y claves más grandes (LIM.valFile, keysFile). Siempre se confirma.
 * El juego no tiene service worker, Cache Storage ni IndexedDB: no hay nada más que traer ni cachés viejas que limpiar.
 * API: VB.Migrate = {run(), manual(kind), decode(texto, {max, file}) → Promise, plan(claves, foto, opciones), parseHash(h), pending(), whenDone(fn),
 *      version: 1, LIM, _lastReport}.
 * ===================================================================== */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : globalThis;
  var VB = W.VB = W.VB || {};
  var PFX = 'make-the-cut.';
  var RAW = PFX + 'mig.raw', DONE = PFX + 'mig.done', BAK = PFX + 'migbak.', TOAST = PFX + 'account.toast';
  var SES = PFX + 'account', META = PFX + 'account.meta', UP = META + '.up';
  var LIM = { url: 1200000, file: 9000000, bytes: 12000000, json: 6000000, val: 2000000, keys: 200, valFile: 5500000, keysFile: 400 };   // *File: archivo o código (no caben en un enlace)
  var KEY_RE = /^make-the-cut\.[A-Za-z0-9_.-]{1,80}$/;
  var TRUSTED = 'https://purupurpito.github.io';
  var MSG = 'Partida traída de Make the Cut';
  var OLD_URL = 'https://purupurpito.github.io/make-the-cut/';   // el puente (bridge/)
  function set(list) { var o = {}; list.forEach(function (k) { o[PFX + k] = 1; }); return o; }
  // del dispositivo: si ya hay una aquí, se queda (si no, se trae: es el mismo navegador)
  var DEVICE = set(['devid', 'device', 'seen', 'install', 'e1tips', 'guided', 'lkHint', 'nethelp2', 'netroom', 'nick', 'retostab', 'role6', 'online.pend']);
  var MERGED = set(['gym', 'look', 'legends', 'profile', 'retos']);   // las que tienen fusión propia en account.js (MERGE)
  var CAREERS = set(['career', 'career6']);
  var OUT = SES + '.out';   // account.js lo apunta al cerrar sesión: un traspaso posterior no vuelve a meter la sesión
  var MIGFIRST = PFX + 'mig.first';   // para account.js: la siguiente sincronización une como la primera entrada (sin fiarse de las horas)
  // progreso para decidir sin horas (las mismas cuentas que account.js score / recPlayed en la primera entrada en la cuenta)
  function squadScore(raw) { try { var o = JSON.parse(raw), s = 0; (o && o.a || []).forEach(function (a) { s += ((a && a.lvl) || 0) * 1000 + ((a && a.xp) || 0) + ((a && a.matches) || 0); }); return +s || 0; } catch (e) { return 0; } }
  function recPlayed(raw) { try { return +(JSON.parse(raw).played) || 0; } catch (e) { return 0; } }
  var QUALITY = {}; QUALITY[PFX + 'squad'] = squadScore; QUALITY[PFX + 'record'] = recPlayed;

  var LS = null; try { LS = W.localStorage; } catch (e) { }
  var SS = null; try { SS = W.sessionStorage; } catch (e) { }
  var SP = typeof Storage !== 'undefined' ? Storage.prototype : null;
  var rawSet = SP && SP.setItem, rawGet = SP && SP.getItem, rawRemove = SP && SP.removeItem;   // ANTES de que account.js los envuelva

  function err(code) { var e = new Error('mig: ' + code); e.code = code; e.mig = true; return e; }
  function warn(m) { try { console.warn('[VB] traspaso: ' + m); } catch (e) { } }
  function noop() { }
  function lsGet(k) { try { return rawGet.call(LS, k); } catch (e) { return null; } }
  function lsSet(k, v) { try { rawSet.call(LS, k, v); return true; } catch (e) { return false; } }
  function dropKey(k) {
    return k.indexOf(PFX + 'mig.') === 0 || k.indexOf('.migbak.') >= 0 || k.indexOf(BAK) === 0 ||
      k === SES + '.gredir' || k === OUT || k.indexOf(SES + '.rl') === 0;
  }

  // ---------------------------------------------------------------- hash
  /** h (sin '#') → {kind: 'mig'|'migcode'|'migfile'|null, p: paquete, rest: el resto del hash sin la parte del traspaso}. */
  function parseHash(h) {
    var out = { kind: null, p: '', rest: '' }, keep = [];
    String(h || '').replace(/^#/, '').split('&').forEach(function (seg) {
      var m = /^(mig|migcode|migfile)(?:=(.*))?$/.exec(seg);
      if (m) { if (!out.kind) { out.kind = m[1]; out.p = m[2] || ''; } }
      else if (seg) keep.push(seg);
    });
    out.rest = keep.join('&');
    return out;
  }

  // ---------------------------------------------------------------- descodificar
  function b64u(s) {
    if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) throw err('base64');
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var bin; try { bin = atob(s); } catch (e) { throw err('base64'); }
    var u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function inflate(bytes, max) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(err('nodecomp'));
    var ds; try { ds = new DecompressionStream('deflate'); } catch (e) { return Promise.reject(err('nodecomp')); }
    var w = ds.writable.getWriter(); w.write(bytes).catch(noop); w.close().catch(noop);
    var r = ds.readable.getReader(), chunks = [], n = 0;
    function pump() {
      return r.read().then(function (x) {
        if (x.done) { var u = new Uint8Array(n), o = 0; chunks.forEach(function (c) { u.set(c, o); o += c.length; }); return u; }
        n += x.value.length;
        if (n > max) { r.cancel().catch(noop); throw err('big'); }
        chunks.push(x.value); return pump();
      });
    }
    return pump().catch(function (e) { throw e && e.mig ? e : err('inflate'); });
  }
  function utf8(bytes) {
    if (typeof TextDecoder !== 'undefined') { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { throw err('utf8'); } }
    var s = ''; for (var i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    try { return decodeURIComponent(escape(s)); } catch (e) { throw err('utf8'); }
  }
  function enc(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    var s = unescape(encodeURIComponent(text)), u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  /** 16 primeras cifras hex del SHA-256 del texto, o null si el navegador no puede (sin crypto.subtle: fuera de https). */
  function sha16(text) {
    var C = W.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    if (!C || !C.subtle || typeof C.subtle.digest !== 'function') return Promise.resolve(null);
    return C.subtle.digest('SHA-256', enc(text)).then(function (b) {
      var u = new Uint8Array(b), h = ''; for (var i = 0; i < 8; i++) h += (u[i] < 16 ? '0' : '') + u[i].toString(16);
      return h;
    }, function () { return null; });
  }
  function fnv(text) {   // huella para mig.done cuando no hay sha
    var h = 0x811c9dc5; for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return 'h' + ('0000000' + h.toString(16)).slice(-8) + text.length.toString(16);
  }
  function plainObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype; }

  /** Descodifica y comprueba un paquete (con o sin 'mig=' delante, o el .json del puente). → Promise<{keys, at, sha, verified, id,
   *  fmt, count}>; rechaza con e.code (format, big, base64, inflate, nodecomp, utf8, sha, json, shape, keys). */
  function decode(text, o) {
    o = o || {};
    var max = o.max || LIM.url;
    return new Promise(function (ok) { ok(); }).then(function () {
      var s = String(text == null ? '' : text);
      if (s.length > max + 64) throw err('big');
      s = s.trim();
      if (s.charAt(0) === '{') {   // el archivo del puente: {"format":"take-the-court-mig","mig":"1.z...."}
        var f; try { f = JSON.parse(s); } catch (e) { throw err('format'); }
        s = f && typeof f.mig === 'string' ? f.mig.trim() : '';
      }
      s = s.replace(/^#/, '').replace(/^mig=/, '');
      if (s.length > max) throw err('big');
      var m = /^1\.([zj])\.([0-9a-f]{16}|0)\.([A-Za-z0-9_-]+)$/.exec(s);
      if (!m) throw err('format');
      var bytes = b64u(m[3]);
      if (bytes.length > LIM.bytes) throw err('big');
      return (m[1] === 'z' ? inflate(bytes, LIM.bytes) : Promise.resolve(bytes)).then(function (raw) {
        var json = utf8(raw);
        if (json.length > (o.file ? LIM.file : LIM.json)) throw err('big');
        return (m[2] === '0' ? Promise.resolve(null) : sha16(json)).then(function (h) {
          if (h && h !== m[2]) throw err('sha');
          var obj; try { obj = JSON.parse(json); } catch (e) { throw err('json'); }
          if (!plainObj(obj) || obj.v !== 1 || obj.from !== 'make-the-cut' || !plainObj(obj.keys)) throw err('shape');
          var names = Object.keys(obj.keys), keys = {};
          if (names.length > (o.file ? LIM.keysFile : LIM.keys)) throw err('keys');
          names.forEach(function (k) {
            var v = obj.keys[k];
            if (!KEY_RE.test(k) || typeof v !== 'string' || v.length > (o.file ? LIM.valFile : LIM.val)) throw err('keys');
            if (!dropKey(k)) keys[k] = v;
          });
          var verified = !!h && h === m[2];
          return { keys: keys, at: +obj.at || 0, sha: m[2], verified: verified, id: verified ? m[2] : fnv(json), fmt: m[1], count: Object.keys(keys).length };
        });
      });
    });
  }

  // ---------------------------------------------------------------- plan de fusión (puro: lo usan las pruebas en node)
  function jparse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function metaOf(raw, now) {
    var o = jparse(raw), out = {};
    if (!plainObj(o)) return out;
    Object.keys(o).forEach(function (k) { var t = +o[k]; if (KEY_RE.test(k) && isFinite(t) && t > 0) out[k] = Math.min(t, now); });
    return out;
  }
  function validSession(raw) { var a = jparse(raw); return plainObj(a) && typeof a.uid === 'string' && typeof a.rt === 'string' && typeof a.user === 'string' && !!a.uid && !!a.rt; }
  /** inc: {clave: texto} traído; loc: {clave: texto} de este origen al cargar (foto). opt: {trusted, mergeKey(k, L, R, incomingNewer),
   *  now}. → {writes: {clave: texto}, report: {added, same, kept, merged, replaced, skipped, session, backups}}. No escribe nada. */
  function plan(inc, loc, opt) {
    opt = opt || {};
    var now = opt.now || Date.now(), writes = {}, rep = { added: [], same: [], kept: [], merged: [], replaced: [], skipped: [], session: 'none', backups: [] };
    var mergeKey = typeof opt.mergeKey === 'function' ? opt.mergeKey : null;
    var first = !!opt.first, choose = opt.choose && typeof opt.choose === 'object' ? opt.choose : {};
    var tag = String(opt.id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'x';   // copias de ESTE traspaso: no pisan las de otro
    var Mi = metaOf(inc[META], now), Ml = metaOf(loc[META], now);
    rep.ask = [];
    function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k) && o[k] != null; }
    function rest(k) { return k.slice(PFX.length); }
    function bak(k, v, inSide) { var b = BAK + tag + '.' + (inSide ? 'in.' : '') + rest(k); writes[b] = v; rep.backups.push(b); }
    // '<clave>.prev' (la usa también account.js al bajar una Carrera de la nube): si ya hay una distinta, antes a migbak
    function prev(k, v) {
      var pk = k + '.prev', old = has(loc, pk) ? loc[pk] : null;
      if (old != null && old !== '' && old !== 'null' && old !== v) bak(pk, old);
      if (old !== v) writes[pk] = v;
    }
    Object.keys(inc).forEach(function (k) {
      if (k === META || k === UP || k === SES || dropKey(k)) return;
      var R = inc[k], L = has(loc, k) ? loc[k] : null;
      if (L == null) {
        // borrada AQUÍ después de un traspaso anterior (abandonar la Carrera también apunta la hora): no se resucita
        if (!first && (Ml[k] || 0) > (Mi[k] || 0)) { rep.skipped.push(k); return; }
        writes[k] = R; rep.added.push(k); return;
      }
      if (L === R) { rep.same.push(k); return; }
      if (DEVICE[k]) { rep.kept.push(k); return; }
      // primer traspaso a este origen: lo de aquí es lo poco que se jugó antes de pasar por el puente (una sala compartida, una
      // partida rápida): las horas no sirven (lo recién creado siempre es «más nuevo») y manda lo de Make the Cut
      var incomingNewer = first || (Mi[k] || 0) > (Ml[k] || 0);
      if (MERGED[k]) {
        var M = null;
        try { M = mergeKey ? mergeKey(k, L, R, incomingNewer) : (incomingNewer ? R : L); } catch (e) { M = incomingNewer ? R : L; }
        if (typeof M !== 'string' || M === L) { rep.kept.push(k); return; }
        bak(k, L); writes[k] = M; rep.merged.push(k); return;
      }
      var win = incomingNewer;
      if (CAREERS[k]) {   // dos Carreras distintas: se pregunta (la hoja de handle()); sin respuesta, la regla de horas
        rep.ask.push(k);
        var c = has(choose, k) ? choose[k] : ''; if (c === 'in') win = true; else if (c === 'loc') win = false;
      } else if (QUALITY[k]) {   // escuadrón y récord: gana el de más progreso, como la primera entrada en la cuenta (account.js)
        var qi = QUALITY[k](R), ql = QUALITY[k](L);
        if (qi !== ql) win = qi > ql;
      }
      if (win) { bak(k, L); if (CAREERS[k]) prev(k, L); writes[k] = R; rep.replaced.push(k); }
      else { bak(k, R, true); if (CAREERS[k]) prev(k, R); rep.kept.push(k); }
    });
    // sesión de la cuenta: solo con confianza, válida, si aquí no hay ninguna, en el PRIMER traspaso y sin haber cerrado sesión aquí
    var sesIn = inc[SES], sesLoc = loc[SES];
    if (sesIn != null) {
      if (!opt.trusted) rep.session = 'untrusted';
      else if (sesLoc != null && sesLoc !== '' && sesLoc !== 'null') rep.session = sesLoc === sesIn ? 'same' : 'kept';
      else if (has(loc, OUT)) rep.session = 'signedout';
      else if (!first) rep.session = 'again';
      else if (!validSession(sesIn)) rep.session = 'invalid';
      else { writes[SES] = sesIn; rep.session = 'imported'; if (inc[UP] != null && plainObj(jparse(inc[UP]))) writes[UP] = inc[UP]; }
    }
    // horas: máximo por clave (lo que se trae llega con su hora; lo que se queda, con la suya)
    if (Object.keys(Mi).length) {
      var M2 = {}, ch = false;
      Object.keys(Ml).forEach(function (k) { M2[k] = Ml[k]; });
      Object.keys(Mi).forEach(function (k) { if ((M2[k] || 0) < Mi[k]) { M2[k] = Mi[k]; ch = true; } });
      if (ch || loc[META] == null) writes[META] = JSON.stringify(M2);
    }
    return { writes: writes, report: rep };
  }

  // ---------------------------------------------------------------- navegador
  var pend = false, waiters = [], snap = null, report = null;
  function pending() { return pend; }
  function whenDone(fn) { if (typeof fn !== 'function') return; if (!pend) { try { fn(); } catch (e) { } } else waiters.push(fn); }
  function finish(why) {
    if (why) { report = report || {}; report.result = why; API._lastReport = report; }
    try { if (SS) SS.removeItem(RAW); } catch (e) { }
    if (!pend) return;
    pend = false;
    var w = waiters; waiters = [];
    w.forEach(function (f) { try { f(); } catch (e) { } });
  }
  function takeSnap() {
    snap = {};
    if (!LS) return;
    try { for (var i = 0; i < LS.length; i++) { var k = LS.key(i); if (k && k.indexOf(PFX) === 0) snap[k] = lsGet(k); } } catch (e) { }
  }
  function refTrusted() {
    var r = '', here = '';
    try { r = document.referrer || ''; here = location.hostname; } catch (e) { return false; }
    if (!r) return false;
    var u; try { u = new URL(r); } catch (e) { return false; }
    if (u.origin === TRUSTED) return true;
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/;
    return local.test(here) && local.test(u.hostname);
  }
  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(fn, 0); });
    else setTimeout(fn, 0);
  }
  function doneList() { var a = jparse(lsGet(DONE)); return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }) : []; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function apply(dec, trusted, choose) {
    var A = VB.Account, first = !doneList().length;
    var p = plan(dec.keys, snap || {}, { trusted: trusted, now: Date.now(), mergeKey: A && typeof A.mergeKey === 'function' ? A.mergeKey : null,
      id: dec.id, first: first, choose: choose });
    // dos Carreras distintas (aquí y en Make the Cut): que elija el jugador antes de escribir nada
    if (!choose && p.report.ask.length && VB.Splat && VB.Splat.sheet) { askCareers(p.report.ask.slice(), dec, {}, function (ch) { apply(dec, trusted, ch); }); return; }
    var w = p.writes, wrote = 0, failed = [];
    // primero las copias; una clave cuya copia no cabe no se toca
    var bakOf = {};
    Object.keys(w).forEach(function (k) { if (k.indexOf(BAK) === 0) bakOf[k] = 1; });
    var bad = {};
    Object.keys(bakOf).forEach(function (b) {
      if (lsGet(b) !== w[b] && !lsSet(b, w[b])) { var r = b.slice(BAK.length).replace(/^[A-Za-z0-9]+\./, '').replace(/^in\./, ''); bad[PFX + r] = 1; failed.push(PFX + r); }
    });
    Object.keys(w).forEach(function (k) {
      if (bakOf[k] || bad[k] || bad[k.replace(/\.prev$/, '')]) return;
      if (lsGet(k) === w[k]) return;
      if (lsSet(k, w[k])) { if (k !== META && k !== UP && !/\.prev$/.test(k)) wrote++; } else failed.push(k);
    });
    var d = doneList().filter(function (x) { return x !== dec.id; }); d.push(dec.id); lsSet(DONE, JSON.stringify(d.slice(-5)));
    // con cuenta (traída o de antes), la siguiente sincronización une con la nube por progreso y pregunta por las Carreras, como al
    // entrar en un dispositivo nuevo: las horas de lo traído no dicen nada frente a las de la nube (account.js syncDown)
    if (wrote) lsSet(MIGFIRST, '1');
    report = p.report; report.failed = failed; report.wrote = wrote; report.trusted = !!trusted; report.id = dec.id;
    if (wrote || p.report.session === 'imported') {
      report.result = 'imported'; API._lastReport = report;
      try { if (SS) { SS.removeItem(RAW); SS.setItem(TOAST, MSG); } } catch (e) { }
      try { console.info('[VB] traspaso: ' + wrote + ' datos traídos de Make the Cut'); } catch (e) { }
      // recarga de verdad (el enlace ya está limpio: location.replace a la misma dirección con otro hash no recargaría)
      if (!API._noReload) { try { location.reload(); } catch (e) { } return; }
      finish(null);
    } else finish('nothing');
  }

  function careerSummary(raw) {
    var A = VB.Account; try { if (A && typeof A._careerInfo === 'function') return A._careerInfo(raw); } catch (e) { }
    return 'Carrera guardada';
  }
  /** Una hoja por Carrera que choca: «La de Make the Cut» / «La de aquí». La otra queda en migbak (y en '<clave>.prev'). */
  function askCareers(list, dec, ch, cb) {
    var k = list.shift(); if (!k) { cb(ch); return; }
    var S = VB.Splat, L = (snap || {})[k], R = dec.keys[k], done = false, nm = k === PFX + 'career6' ? 'Carrera de pista' : 'Carrera de playa';
    var next = function (v) { if (done) return; done = true; if (v) ch[k] = v; askCareers(list, dec, ch, cb); };
    S.sheet({ title: '¿Qué ' + nm + ' te quedas?', cls: 'vb-mig',
      html: '<p>Tienes una ' + nm + ' en Make the Cut y otra aquí. ¿Con cuál sigues? La otra se guarda en una copia.</p>' +
        '<p><b>Make the Cut:</b> ' + esc(careerSummary(R)) + '<br><b>Aquí:</b> ' + esc(careerSummary(L)) + '</p>',
      actions: [{ label: 'La de aquí', cls: 'sp-cream', id: 'migKeepLoc', fn: function () { next('loc'); } },
        { label: 'La de Make the Cut', primary: true, id: 'migKeepIn', fn: function () { next('in'); } }],
      onClose: function () { next(null); } });
  }

  function confirmSheet(dec, cb) {
    var S = VB.Splat, n = dec.count, chosen = false;
    var html = '<p>Este enlace trae <b>' + n + (n === 1 ? ' dato' : ' datos') + '</b> guardados de Make the Cut, el nombre de antes de Take the Court.</p>' +
      '<p>Tráelos solo si son tuyos. Lo que ya tengas aquí no se pierde: se guarda una copia.</p>';
    if (S && S.sheet) {
      S.sheet({ title: '¿Traer la partida de Make the Cut?', html: html, cls: 'vb-mig',
        actions: [{ label: 'No', cls: 'sp-cream', fn: function () { chosen = true; cb(false); } },
          { label: 'Sí, traerla', primary: true, id: 'migYes', fn: function () { chosen = true; cb(true); } }],
        onClose: function () { if (!chosen) { chosen = true; cb(false); } } });
    } else cb(!!(W.confirm && W.confirm('¿Traer la partida de Make the Cut? (' + n + ' datos)')));
  }

  function handle(dec, trusted) {
    if (doneList().indexOf(dec.id) >= 0) { report = { result: 'already', id: dec.id }; API._lastReport = report; finish(null); return; }
    trusted = !!trusted && dec.verified;
    var n = 0; Object.keys(dec.keys).forEach(function (k) { if (k !== META && k !== UP && (k !== SES || trusted)) n++; });
    dec.count = n;
    if (!n) { finish('empty'); return; }
    if (trusted) { apply(dec, true); return; }
    confirmSheet(dec, function (yes) { if (yes) apply(dec, false); else finish('declined'); });
  }

  var CODE_MSG = { big: 'Es demasiado grande.', format: 'No es un código de partida.', base64: 'El código está cortado o tiene algo mal.',
    inflate: 'El código está cortado o tiene algo mal.', sha: 'El código está cortado o tiene algo mal.', nodecomp: 'Este navegador no puede abrir este código: prueba con otro.' };
  function css() {
    if (document.getElementById('migCss')) return;
    var st = document.createElement('style'); st.id = 'migCss';
    st.textContent = '.vb-migman textarea{display:block;width:100%;box-sizing:border-box;min-height:64px;max-height:30vh;resize:vertical;' +
      'font:13px/1.3 ui-monospace,Consolas,monospace;color:var(--sp-ink,#15102a);background:var(--sp-cream2,#fffaf0);border:var(--sp-line,3px) solid var(--sp-ink,#15102a);' +
      'border-radius:10px;padding:8px 10px;word-break:break-all}.vb-migman .mig-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0 0}' +
      '.vb-migman #migName{font-size:13px;opacity:.85;word-break:break-all}.vb-migman #migErr{color:var(--sp-danger,#ff4a5c);font-weight:700;margin:8px 0 0;min-height:1em}' +
      '.vb-migman #migErr:empty{display:none}.vb-migman a{color:inherit;font-weight:800;text-decoration:underline;text-underline-offset:2px}';
    (document.head || document.documentElement).appendChild(st);
  }
  function manual(kind, menu) {
    var S = VB.Splat;
    if (!S || !S.sheet) { finish('nosheet'); return; }
    css();
    var fileText = '', api = null, busy = false, chosen = false;
    var html = '<p>' + (kind === 'migfile' ? 'Elige el archivo que descargaste en la página de Make the Cut' : 'Pega el código que copiaste en la página de Make the Cut') +
      ' y pulsa <b>Traer</b>.</p>' +
      (menu ? '<p>¿Sin código? Abre <a href="' + OLD_URL + '" target="_blank" rel="noopener">la dirección de antes</a> en el navegador donde jugabas.</p>' : '') +
      '<textarea id="migCode" rows="3" spellcheck="false" autocomplete="off" aria-label="Código de la partida" placeholder="1.z.…"></textarea>' +
      '<p class="mig-row"><label class="sp-btn sp-sm sp-cream" id="migPick"><span class="sp-t">Elegir archivo</span>' +
      '<input type="file" id="migFile" accept=".json,.txt,application/json,text/plain" hidden></label> <span id="migName"></span></p>' +
      '<p id="migErr" role="alert"></p>';
    api = S.sheet({ title: 'Traer tu partida', html: html, cls: 'vb-mig vb-migman',
      actions: [{ label: 'Cancelar', cls: 'sp-cream', fn: function () { chosen = true; finish('declined'); } },
        { label: 'Traer', primary: true, id: 'migGo', keep: true, fn: function () {
          if (busy) return false;
          var ta = api.el.querySelector('#migCode'), txt = fileText || (ta ? ta.value : '');
          var er = api.el.querySelector('#migErr');
          if (!txt.trim()) { if (er) er.textContent = 'Primero pega el código o elige el archivo.'; return false; }
          busy = true; if (er) er.textContent = '';
          decode(txt, { max: LIM.file, file: true }).then(function (dec) {
            chosen = true; busy = false; api.close(true); handle(dec, false);
          }, function (e) { busy = false; warn('código manual rechazado (' + (e && e.code) + ')'); if (er) er.textContent = CODE_MSG[e && e.code] || 'No es un código de partida.'; });
          return false;
        } }],
      onClose: function () { if (!chosen) { chosen = true; finish('declined'); } } });
    var fi = api.el.querySelector('#migFile');
    if (fi) fi.addEventListener('change', function () {
      var f = fi.files && fi.files[0], nm = api.el.querySelector('#migName'), er = api.el.querySelector('#migErr');
      if (!f) return;
      if (f.size > LIM.file + 1024) { if (er) er.textContent = CODE_MSG.big; return; }
      var r = new FileReader();
      r.onload = function () { fileText = String(r.result || ''); if (nm) nm.textContent = f.name; if (er) er.textContent = ''; };
      r.readAsText(f);
    });
    if (kind === 'migfile') { var pk = api.el.querySelector('#migPick'); if (pk) setTimeout(function () { try { pk.focus(); } catch (e) { } }, 60); }
  }

  /** Mira el enlace (o un traspaso a medias en sessionStorage) y lo pone en marcha. Lo llama este script al cargar. */
  function run() {
    var job = null, h = '';
    try { h = location.hash || ''; } catch (e) { return false; }
    var p = h.length > 1 ? parseHash(h) : { kind: null };
    if (p.kind) {
      try { history.replaceState(history.state, '', location.pathname + location.search + (p.rest ? '#' + p.rest : '')); } catch (e) { }
      if (p.kind === 'mig') {
        if (!p.p) return false;
        job = { p: p.p, trusted: refTrusted() };
        try { if (SS && p.p.length <= LIM.url) SS.setItem(RAW, JSON.stringify(job)); } catch (e) { }
      } else job = { manual: p.kind };
    } else {
      var s = null; try { s = SS && SS.getItem(RAW); } catch (e) { }
      if (!s) return false;
      job = jparse(s);
      if (!plainObj(job) || typeof job.p !== 'string') { finish(null); return false; }
      job.trusted = job.trusted === true;
    }
    pend = true; takeSnap(); report = null;
    if (job.manual) { onReady(function () { manual(job.manual); }); return true; }
    decode(job.p, { max: LIM.url }).then(function (dec) {
      onReady(function () { handle(dec, job.trusted); });
    }, function (e) {
      warn('paquete rechazado (' + (e && e.code) + ')');
      report = { result: 'rejected', why: e && e.code }; API._lastReport = report;
      finish(null);
      if (e && e.code === 'nodecomp') onReady(function () { if (VB.Splat && VB.Splat.toast) VB.Splat.toast('Este navegador no puede abrir la partida traída: actualízalo o usa el código en otro.', { ms: 6000 }); });
    });
    return true;
  }

  /** Desde Ajustes › Info («Traer tu partida»): la misma hoja que #migcode, con el enlace a la dirección antigua. */
  function openManual(kind) {
    if (pend || (VB.Splat && VB.Splat.sheetOpen && VB.Splat.sheetOpen())) return false;
    takeSnap(); report = null; manual(kind === 'migfile' ? 'migfile' : 'migcode', true); return true;
  }

  var API = VB.Migrate = { run: run, decode: decode, plan: plan, parseHash: parseHash, pending: pending, whenDone: whenDone, manual: openManual,
    version: 1, LIM: LIM, KEY_RE: KEY_RE, _lastReport: null, _noReload: false };
  if (typeof document !== 'undefined' && typeof location !== 'undefined' && LS && rawSet) run();
})();
