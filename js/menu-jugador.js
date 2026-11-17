/* MAKE THE CUT — js/menu-jugador.js: prototipo de menú principal «TU JUGADOR» (solo con ?menu=jugador; sin la bandera no hace nada)
 *
 * El partido de demo se queda de fondo, a la vista y sin velos; lo que cambia son los BOTONES, cada uno con su material:
 *   - JUGAR: parche crema cosido con el gajo de balón del color de TU equipación y labio de tinta que se hunde al pulsar.
 *   - Reto del día: sello dorado pegado en la esquina de JUGAR (texto en círculo, medalla de hoy).
 *   - Jugadores y Vestuario: tiras de esparadrapo sesgadas; Jugadores lleva tu camiseta con el dorsal y el nivel, y en Vestuario
 *     asoma la cabeza de tu jugador (retrato recortado de VB.Doll.portrait con req.matte, pintado una vez por main.js).
 *   - Cómo se juega, Controles y Ajustes: etiquetas de tinta con icono, más pequeñas y rectas.
 *   - Carrera: entrada de partido troquelada con tu escudo y el del rival.
 * Reutiliza los MISMOS botones (ids y manejadores de ui.js): solo los cambia de sitio dentro de .menu-col y les añade adornos.
 * Estilos: bloque «MENÚ TU JUGADOR» de index.html (todo bajo #menu.mj). Pruebas: &mjseed=1 (Carrera de muestra), &mjfocus=<id>.
 */
(function () {
  'use strict';
  var Q = {};
  try { location.search.replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); Q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '1' : decodeURIComponent(kv.slice(i + 1)); }); } catch (e) { }
  if (Q.menu !== 'jugador') return;
  var VB = window.VB = window.VB || {};
  var menu = document.getElementById('menu'), col = menu && menu.querySelector('.menu-col'), nav = col && col.querySelector('.mlist');
  if (!menu || !col || !nav) return;
  var $ = function (id) { return document.getElementById(id); };
  function mk(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hex(n) { return '#' + ('000000' + ((n >>> 0) & 0xffffff).toString(16)).slice(-6); }
  function mix(a, b, t) {
    var r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, bl = (a & 255) * (1 - t) + (b & 255) * t;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
  }

  menu.classList.add('mj');
  var fl = document.createElement('link'); fl.rel = 'stylesheet';
  fl.href = 'https://fonts.googleapis.com/css2?family=Bowlby+One&family=Titan+One&family=Rubik:wght@500;600;700;800;900&display=swap';
  document.head.appendChild(fl);

  // ---------------------------------------------------------------- piezas gráficas (SVG)
  var SEAM = '<path d="M12 12C12 8 10.5 4.5 8 2.8"/><path d="M13.8 2.2C16.5 5.5 17.8 9.5 17.3 13.8"/>';
  var PANEL = 'M12 12C12 8 10.5 4.5 8 2.8A10 10 0 0 1 13.8 2.2C16.5 5.5 17.8 9.5 17.3 13.8C16 13.9 13.7 13 12 12Z';
  var BALL = '<svg viewBox="1.4 1.4 21.2 21.2" aria-hidden="true" focusable="false"><circle class="b0" cx="12" cy="12" r="10"/><path class="b1" d="' + PANEL + '"/>' +
    '<path class="b2" d="' + PANEL + '" transform="rotate(120 12 12)"/><g class="bs">' + SEAM + '<g transform="rotate(120 12 12)">' + SEAM + '</g><g transform="rotate(240 12 12)">' + SEAM + '</g></g>' +
    '<circle class="b3" cx="12" cy="12" r="10"/></svg>';
  var IC = {
    tut: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm.1 13.3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12.2 5.6c-2.3 0-3.9 1.3-4.1 3.4l2.4.3c.1-.9.7-1.5 1.6-1.5.9 0 1.5.5 1.5 1.3 0 .6-.3 1-1.2 1.6-1.2.8-1.7 1.6-1.7 2.9v.4h2.4v-.3c0-.7.2-1 1.1-1.6 1.2-.8 1.9-1.7 1.9-3 0-2-1.6-3.5-3.9-3.5z"/></svg>',
    ctl: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 6.5h9.6c2.9 0 4.5 2.4 5.1 6.3.5 3.2-.4 5-2 5-1.3 0-2.2-1.2-3.3-2.6-.4-.5-.8-.7-1.4-.7H8.8c-.6 0-1 .2-1.4.7-1.1 1.4-2 2.6-3.3 2.6-1.6 0-2.5-1.8-2-5 .6-3.9 2.2-6.3 5.1-6.3zM7 9v1.6H5.4v1.8H7V14h1.8v-1.6h1.6v-1.8H8.8V9zm9.6.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm-1.9 2.1a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"/></svg>',
    set: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.8c.1.6.1 1.2 0 1.8l2 1.8-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9-1.7-2.9 2-1.8a6 6 0 0 1 0-1.8l-2-1.8 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" transform="translate(0 1.2) scale(1 .95)"/></svg>'
  };
  // camiseta con dorsal (Jugadores): el color es el de tu equipación; el número, tu dorsal
  var JERSEY = '<svg class="mj-jy" viewBox="0 0 64 60" aria-hidden="true" focusable="false"><path class="j0" d="M22 3 6 11l5 13 6-2.5V57h30V21.5l6 2.5 5-13L42 3c-1.5 4.2-5.3 7-10 7S23.5 7.2 22 3z"/>' +
    '<path class="j1" d="M22 3c1.5 4.2 5.3 7 10 7s8.5-2.8 10-7"/><text class="j2" x="32" y="46" text-anchor="middle">1</text></svg>';
  var PLAY_PANEL = '<svg class="mj-pp" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
    '<path class="f" d="M0 0H78C60 30 60 70 78 100H0z"/><path class="s" d="M70 5C55 34 55 66 70 95"/><path class="e" d="M78 0C60 30 60 70 78 100"/></svg>' +
    '<span class="mj-tri" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z"/></svg></span>' +
    '<svg class="mj-emb" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g>' + SEAM + '<g transform="rotate(120 12 12)">' + SEAM + '</g><g transform="rotate(240 12 12)">' + SEAM + '</g></g><circle cx="12" cy="12" r="10"/></svg>';

  // ---------------------------------------------------------------- DOM: nueva disposición de los mismos botones
  var brand = col.querySelector('.brand'), side = mk('div', 'mj-side');
  col.appendChild(side);
  if (brand) side.appendChild(brand);
  side.appendChild(nav);
  var bCont = $('btnCont'), bPlay = $('btnPlay'), bSq = $('btnSquad'), bLook = $('btnLook'), bTut = $('btnTut'), bCtl = $('btnControls'), bSet = $('btnSettings');
  var go = mk('div', 'mj-go'), tape = mk('div', 'mj-tape'), strip = mk('div', 'mj-strip');
  var stamp = mk('button', 'mj-stamp');
  stamp.type = 'button'; stamp.id = 'btnMjReto'; stamp.setAttribute('aria-label', 'Reto del día');
  stamp.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><defs><path id="mjRing" d="M50 50m-34.5 0a34.5 34.5 0 1 1 69 0a34.5 34.5 0 1 1-69 0"/></defs>' +
    '<circle class="st0" cx="50" cy="50" r="46"/><circle class="st1" cx="50" cy="50" r="41"/>' +
    '<text class="st2"><textPath href="#mjRing" textLength="214" lengthAdjust="spacing">RETO DEL DÍA ★ RETO DEL DÍA ★</textPath></text>' +
    '<circle class="st3" cx="50" cy="50" r="25"/></svg><span class="mj-sc" id="mjStampC"></span>';
  if (bPlay) { bPlay.insertAdjacentHTML('afterbegin', PLAY_PANEL); go.appendChild(bPlay); }
  go.appendChild(stamp);
  // manchas de pintura (pegatinas): la sombra de tinta desplazada, la mancha con su goterón y gotas sueltas alrededor
  function blob(d, dots, vb) {
    var c = dots.map(function (q) { return '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + q[2] + '"/>'; }).join('');
    return '<svg class="mj-blob" viewBox="' + vb + '" preserveAspectRatio="none" aria-hidden="true" focusable="false"><g class="bl-sh"><path d="' + d + '"/>' + c + '</g>' +
      '<g class="bl-f"><path d="' + d + '"/>' + c + '</g><path class="bl-hi" d="' + d + '"/></svg>';
  }
  var BLOB_W = 'M30 14C60 4 95 12 130 8C170 3 205 10 240 6C268 3 290 14 288 34C286 50 296 62 284 76C274 88 250 82 228 84C229 92 232 97 232 103C232 111 210 111 210 103C210 97 212 92 212 85C180 88 140 82 100 86C97 90 98 92 98 95C98 101 84 101 84 95C84 92 85 90 85 86C60 88 40 90 24 82C8 74 14 58 10 44C6 28 12 18 30 14Z';
  var BLOB_W2 = 'M22 18C50 6 92 14 128 10C168 6 200 4 238 9C266 12 292 10 290 36C289 52 284 64 288 76C282 90 256 84 236 86C200 88 172 84 150 87C149 95 152 101 152 107C152 115 132 115 132 107C132 101 134 95 134 88C104 90 70 84 46 88C26 92 10 84 12 66C13 52 6 44 9 32C11 22 14 20 22 18Z';
  var BLOB_S = ['M18 12C45 4 80 10 110 6C135 3 152 14 150 32C149 46 156 58 146 66C134 76 110 70 96 72C96 77 98 80 98 84C98 90 84 90 84 84C84 80 85 77 85 72C60 74 40 76 22 70C6 64 10 50 8 38C6 24 6 16 18 12Z',
    'M14 16C38 6 70 12 104 8C132 5 154 10 152 30C151 44 148 56 152 64C146 76 124 72 104 73C84 74 64 70 52 73C52 78 54 81 54 85C54 91 40 91 40 85C40 81 41 78 41 73C26 74 10 72 9 58C8 46 4 30 14 16Z',
    'M20 10C44 8 76 4 108 9C136 13 150 8 152 28C153 42 158 52 150 64C142 74 128 70 116 72C116 77 118 81 118 85C118 91 104 91 104 85C104 81 105 77 105 72C80 74 52 76 30 72C10 68 6 56 9 42C11 30 4 14 20 10Z'];
  var BLOB_T = 'M14 22C80 10 160 18 240 12C300 8 360 14 390 20C398 40 392 60 396 78C340 86 280 80 222 86C222 94 225 99 225 105C225 113 204 113 204 105C204 99 206 94 206 87C150 90 80 84 18 82C8 64 16 42 14 22Z';
  if (bSq) { bSq.insertAdjacentHTML('afterbegin', blob(BLOB_W, [[296, 22, 4], [5, 90, 3], [262, 96, 2.5]], '0 0 300 100') + '<span class="mj-ic mj-jyw">' + JERSEY + '</span>'); tape.appendChild(bSq); }
  if (bLook) { bLook.insertAdjacentHTML('afterbegin', blob(BLOB_W2, [[4, 12, 3.5], [296, 92, 3], [180, 98, 2]], '0 0 300 100') + '<span class="mj-ic mj-head"><img alt="" draggable="false" hidden></span>'); tape.appendChild(bLook); }
  [[bTut, IC.tut], [bCtl, IC.ctl], [bSet, IC.set]].forEach(function (p, i) { if (!p[0]) return; p[0].insertAdjacentHTML('afterbegin', blob(BLOB_S[i], [[157, 12 + i * 20, 2.6], [4, 72 - i * 18, 2.2]], '0 0 160 80') + '<span class="mj-ti">' + p[1] + '</span>'); strip.appendChild(p[0]); });
  if (bCont) { bCont.appendChild(mk('span', 'mj-tk', '')); bCont.insertAdjacentHTML('afterbegin', blob(BLOB_T, [[397, 10, 3], [6, 92, 3], [300, 97, 2.2]], '0 0 400 100')); nav.appendChild(bCont); }
  // gotas de pintura del color de tu equipación junto a JUGAR (coherencia con las manchas)
  go.insertAdjacentHTML('afterbegin', '<svg class="mj-gdots" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="10" cy="30" r="6"/><circle cx="24" cy="36" r="3"/><circle cx="3" cy="16" r="2.4"/></svg>');
  nav.appendChild(go); nav.appendChild(tape); nav.appendChild(strip);
  [bCont, bSq, bLook, bTut, bCtl, bSet].forEach(function (b) { if (b) b.classList.add('mj-sq'); });
  var sub = $('playMainSub'); if (sub) sub.textContent = 'Partido rápido · 6 contra 6 · Entrenamiento';
  var lsub = bLook && bLook.querySelector('.mi-s'); if (lsub) lsub.textContent = 'Tu aspecto';

  stamp.addEventListener('click', function () { var r = $('btnRetos'); if (r) r.click(); });
  // tacto: el botón se hunde al pulsar (también con Intro / A, que llaman a click() sin :active)
  function press(b) { if (!b) return; b.classList.remove('mj-press'); void b.offsetWidth; b.classList.add('mj-press'); setTimeout(function () { b.classList.remove('mj-press'); }, 170); }
  // salpicón al pulsar: gotas que salen disparadas desde el dedo (o el centro del botón) y se secan
  function splash(b, ev) {
    if (!b || b === bPlay || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var r = b.getBoundingClientRect(), m = menu.getBoundingClientRect(), x = ev && ev.clientX ? ev.clientX : r.left + r.width / 2, y = ev && ev.clientY ? ev.clientY : r.top + r.height / 2;
    var g = '', n = 9, rot = Math.random() * 40;
    for (var i = 0; i < n; i++) { var a = (i / n) * 360 + rot, d = 26 + (i % 3) * 9, rr = i % 3 === 0 ? 6 : i % 2 ? 4.6 : 5.4; g += '<circle r="' + rr + '" style="--a:' + a.toFixed(1) + 'deg;--d:' + d + 'px"/>'; }
    var sp = mk('i', 'mj-splash', '<svg viewBox="-60 -60 120 120" aria-hidden="true">' + g + '</svg>');
    sp.style.left = (x - m.left) + 'px'; sp.style.top = (y - m.top) + 'px';
    var bc = getComputedStyle(b).getPropertyValue('--bc'); if (bc) sp.style.setProperty('--c', bc.trim());
    menu.appendChild(sp); setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 560);
  }
  nav.addEventListener('click', function (e) { var b = e.target && e.target.closest ? e.target.closest('button') : null; if (b) { press(b); splash(b, e.detail ? e : null); } }, true);
  // ←/→ en las filas de la portada (Jugar ↔ sello, Jugadores ↔ Vestuario, las tres etiquetas); ↑/↓ los lleva ui.js en orden
  /** ←/→ dentro de una fila: true si el foco estaba en una de las filas de la portada (lo mueve o suena el tope). */
  function rowStep(d) {
    if (!VB.ctx || VB.ctx.state !== 'menu' || col.hidden) return false;
    var a = document.activeElement, rw = a && a.parentNode;
    if (!rw || !(rw === go || rw === tape || rw === strip)) return false;
    var L = Array.prototype.filter.call(rw.querySelectorAll('button'), function (b) { return !b.hidden && !b.disabled; }), i = L.indexOf(a), j = i + d;
    if (i < 0 || j < 0 || j >= L.length) { try { if (VB.Audio && VB.Audio.ui) VB.Audio.ui('arrowEdge', d); } catch (er) { } return true; }
    try { L[j].focus({ preventScroll: true }); } catch (er) { }
    var kf = document.querySelectorAll('.kf'); for (var k = 0; k < kf.length; k++) kf[k].classList.remove('kf');
    L[j].classList.add('kf');
    try { if (VB.Audio && VB.Audio.hover) VB.Audio.hover(); } catch (er) { }
    return true;
  }
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (rowStep(e.key === 'ArrowRight' ? 1 : -1)) e.preventDefault();
  });
  // mando: stick o cruceta a los lados en esas filas (ui.js lleva arriba/abajo; aquí solo el eje X, con su repetición)
  var padX = { dir: 0, t: 0 };
  function wrapNav() {
    var U = VB.UI; if (!U || typeof U.nav !== 'function' || U.nav._mj) return;
    var orig = U.nav;
    U.nav = function (it, dt) {
      if (it && it.device === 'gamepad') {
        var v = it.mx || 0, dir = v > 0.55 ? 1 : v < -0.55 ? -1 : 0;
        if (dir !== padX.dir) { padX.dir = dir; padX.t = 0.38; if (dir) rowStep(dir); }
        else if (dir) { padX.t -= dt || 0; if (padX.t <= 0) { padX.t = 0.14; rowStep(dir); } }
      } else padX.dir = 0;
      return orig.apply(this, arguments);
    };
    U.nav._mj = true;
  }
  wrapNav();

  // ---------------------------------------------------------------- datos vivos (sin coste por frame: firma, como mucho cada 1,2 s)
  function career() { try { var C = VB.Career; return C && C.get ? C.get() : null; } catch (e) { return null; } }
  function prog() { try { return VB.Prog && VB.Prog.get ? VB.Prog.get().a[0] : null; } catch (e) { return null; } }
  function crest(k, px, c) { try { var W = VB.CareerWorldUI; return k && W && W.crestSVG ? W.crestSVG(k, px, { c: c }) : ''; } catch (e) { return ''; } }
  var headKey = '', lastSig = '', ticketSig = '';
  function headReq(c) {
    var r = null;
    if (c && VB.CareerUI && VB.CareerUI.portraitReq) r = VB.CareerUI.portraitReq(c, 'me', 72, 'alegria');
    if (!r && VB.UI && VB.UI.portraitReqMatch) r = VB.UI.portraitReqMatch(0, 0, 72);
    if (!r) return null;
    var px = Math.max(128, Math.min(320, Math.ceil(($('btnLook') ? $('btnLook').getBoundingClientRect().height : 60) * 1.5 * (window.devicePixelRatio || 1) / 32) * 32));
    return Object.assign({}, r, { matte: true, bg: 0, pose: 'stand', face: 'alegria', yaw: -0.5, zoom: 1, size: px });
  }
  function setHead(url) {
    var img = bLook && bLook.querySelector('.mj-head img'); if (!img || !url || img.getAttribute('src') === url) return;
    img.onload = function () { img.hidden = false; bLook.classList.add('has-head'); };
    img.setAttribute('src', url);
  }
  function askHead(c) {
    var A = VB.ctx && VB.ctx.actions, req = headReq(c); if (!A || !A.portrait || !req) return;
    var r = null; try { r = A.portrait(req); } catch (e) { r = null; }
    if (!r || !r.key) return;
    headKey = r.key; if (r.url) setHead(r.url);
  }
  window.addEventListener('vb-portrait', function (ev) { var d = ev && ev.detail; if (d && d.key === headKey && d.url) setHead(d.url); });

  function ticket(c) {
    var t = bCont && bCont.querySelector('.mj-tk'); if (!t || !c) return;
    var H = null, n = null, me = null, K = VB.Career;
    try { H = VB.CareerUI && VB.CareerUI.heroData ? VB.CareerUI.heroData(c) : null; } catch (e) { H = null; }
    try { n = K && K.next ? K.next(c) : null; } catch (e) { n = null; }
    try { me = K && K.myClub ? K.myClub(c) : null; } catch (e) { me = null; }
    if (!H) return;
    var rv = n && n.rival, away = n && n.kind === 'league' && n.atHome === false;
    var crests = me ? '<span class="tk-cr">' + crest(me, 40, c) + '</span>' + (rv ? '<i class="tk-vs">' + (away ? 'en' : 'vs') + '</i><span class="tk-cr">' + crest(rv, 40, c) + '</span>' : '') : '<span class="tk-cr tk-ball">' + BALL + '</span>';
    var k = rv ? 'Próximo partido' : 'Carrera · ' + H.kind, ttl = rv ? rv.name : H.title, ln = rv ? (H.chip ? H.chip + ' · ' : '') + 'Continuar carrera' : (H.chip ? H.chip + ' · ' : '') + (H.line || '');
    var h = '<span class="tk-stub">' + crests + '</span><span class="tk-main"><small class="tk-k">' + esc(k) + '</small><b class="tk-t">' + esc(ttl) + '</b><small class="tk-s">' + esc(ln) + '</small></span>' +
      '<span class="tk-go" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></span>';
    var cmp = h.replace(/n\d+"/g, '"').replace(/n\d+\)/g, ')');
    if (cmp !== ticketSig) { ticketSig = cmp; t.innerHTML = h; }
  }
  function stampSync() {
    var R = VB.Retos, C = $('mjStampC');
    stamp.hidden = !R || !$('btnRetos');
    if (!R || !C) return;
    var ds = null, un = 0, dd = null; try { ds = R.dayState(); un = R.unseen().length; dd = R.daily ? R.daily() : null; } catch (e) { return; }
    var m = ds ? ds.m | 0 : 0, MED = ['', 'Bronce', 'Plata', 'Oro'];
    var h = m ? '<i class="sc-med t' + m + '"></i><b>' + MED[m] + '</b>' : '<i class="sc-ball">' + BALL + '</i><b>Hoy</b>';
    if (C._h !== h) { C._h = h; C.innerHTML = h; }
    stamp.classList.toggle('has-new', un > 0);
    stamp.setAttribute('aria-label', 'Reto del día' + (dd && dd.mapName ? ' en ' + dd.mapName : '') + ', ' + (m ? 'hoy ' + MED[m].toLowerCase() : 'sin jugar'));
  }
  function sync(force) {
    if (!VB.ctx || VB.ctx.state !== 'menu') return;
    var c = career(), live = c && c.player ? c : null, a = prog(), st = VB.ctx.settings || {};
    var kit = typeof st.kitShirt === 'number' ? st.kitShirt : 0xff5a2c, num = a ? a.num : 1, lvl = a ? a.lvl : 1;
    if (live) {
      var k = null; try { k = VB.Career.myClub ? VB.Career.myClub(live) : null; } catch (e) { k = null; }
      if (k && k.kit && typeof k.kit.shirt === 'number') kit = k.kit.shirt;
      num = live.player.num | 0; lvl = (live.player.lvl | 0) || 1;
    }
    stampSync();
    if (live) ticket(live);
    var hc = !!(bCont && !bCont.hidden); if (menu.classList.contains('has-cont-mj') !== hc) menu.classList.toggle('has-cont-mj', hc);
    var hb = $('btnLook') ? Math.round($('btnLook').getBoundingClientRect().height) : 0;
    var sig = [kit, num, lvl, live ? 1 : 0, hb].join('|');
    if (!force && sig === lastSig && headKey) return;
    lastSig = sig;
    var lum = ((kit >> 16) & 255) * 0.3 + ((kit >> 8) & 255) * 0.59 + (kit & 255) * 0.11;
    menu.style.setProperty('--mj-kit', hex(kit));
    menu.style.setProperty('--mj-kit-d', hex(mix(kit, 0x15102a, 0.45)));
    menu.style.setProperty('--mj-kit-ink', lum > 170 ? '#15102a' : '#fff6e4');
    // color de contraste para la otra mancha: lima con equipaciones cálidas, rosa chicle con las verdes, naranja con las azules
    var cr = (kit >> 16) & 255, cg = (kit >> 8) & 255, cb = kit & 255;
    menu.style.setProperty('--mj-alt', cg > cr && cg >= cb ? '#ff4fa3' : cb > cr && cb > cg ? '#ff9a1f' : '#a6ea2c');
    var jt = bSq && bSq.querySelector('.j2'); if (jt) { jt.textContent = String(num); jt.setAttribute('font-size', String(num).length > 1 ? '22' : '27'); }
    askHead(live);
  }
  function tick() { try { wrapNav(); sync(false); } catch (e) { try { console.error('[VB][ERROR] menu-jugador: ' + (e && e.message || e)); } catch (e2) { } } }
  setInterval(tick, 1200);
  window.addEventListener('resize', function () { setTimeout(tick, 120); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(tick, 300); }); else setTimeout(tick, 300);

  // ---------------------------------------------------------------- pruebas (capturas): &mjseed=1 Carrera de muestra con club; &mjfocus=id enfoca
  if (Q.mjseed === '1') {
    setTimeout(function () {
      try {
        var C = VB.Career; if (!C || C.get()) return;
        var c = C.create({ name: 'Ares Belmonte', num: 7, role: 'cr', points: 21, seed: 4242, ctrl: 'one' });
        var oi = 0; (c.offers || []).some(function (o, i) { if (!o.trial) { oi = i; return true; } return false; });
        C.acceptOffer(oi, 2);
        for (var i = 0; i < 4 && C.simulateNext; i++) C.simulateNext(C.get());
        if (VB.UI && VB.UI.refreshMenu) VB.UI.refreshMenu();
        sync(true);
      } catch (e) { console.warn('[VB] mjseed: ' + e); }
    }, 900);
  }
  if (Q.mjfocus) setTimeout(function () { var b = $(Q.mjfocus); if (b) { try { b.focus({ preventScroll: true }); } catch (e) { } b.classList.add('kf'); } }, 2600);
})();
