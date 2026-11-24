/* TAKE THE COURT — tools/mobaudit-page.js (owner: ui_main)
 * Código que tools/mobaudit.js inyecta en la página (se serializa con toString(): nada de require ni de cierres).
 * - helpers(): window.__MA = utilidades para abrir pantallas (ensureMenu, click, tab, until, sleep, seedCareer…).
 * - measure(o): métricas de la pantalla visible (letra, objetivos táctiles, recortes, salida/acción principal, solapes,
 *   desplazamientos y densidad). o = {exit, primary} (selectores opcionales de la pantalla).
 */
'use strict';

function helpers() {
  if (window.__MA) return true;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $ = function (s) { return typeof s === 'string' ? document.querySelector(s) : s; };
  function until(fn, ms, step) {
    var t0 = Date.now();
    return new Promise(function (res) {
      (function tick() {
        var ok = false; try { ok = !!fn(); } catch (e) { ok = false; }
        if (ok || Date.now() - t0 > (ms || 3000)) return res(ok);
        setTimeout(tick, step || 40);
      })();
    });
  }
  function shown(e) {
    e = $(e); if (!e) return false;
    if (e.checkVisibility && !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  }
  function click(s) { var e = $(s); if (!e) return false; e.click(); return true; }
  async function idle() { await until(function () { var w = VB.UI && VB.UI._wipe && VB.UI._wipe(); return !w || !w.ph; }, 2000); }
  /** Cierra todo lo que pueda haber encima y vuelve a la portada del menú (estado 'menu'). */
  async function ensureMenu() {
    var U = VB.UI;
    try { if (U.noteOpen && U.noteOpen()) U.noteBack(); } catch (e) { }
    try { if (VB.Account && VB.Account.isOpen && VB.Account.isOpen()) VB.Account.close(); } catch (e) { }
    try { if (VB.Install && VB.Install.isOpen && VB.Install.isOpen()) VB.Install.close(); } catch (e) { }
    for (var i = 0; i < 8 && U.isPanelOpen && U.isPanelOpen(); i++) { click('#btnPanelBack'); await sleep(40); }
    try { if (VB.CareerUI && VB.CareerUI.isOpen && VB.CareerUI.isOpen()) VB.CareerUI.close(); } catch (e) { }
    await idle();
    for (var j = 0; j < 8 && U.menuPage && U.menuPage() !== 'main'; j++) { if (!U.menuBack()) break; await idle(); await sleep(30); }
    await idle();
    return VB.ctx.state === 'menu';
  }
  /** Página del menú: ensureMenu + menuGo(p) (apilando Jugar delante si hace falta). */
  async function page(p, o) {
    var U = VB.UI;
    var top = (U.noteOpen && U.noteOpen()) || U.isPanelOpen() || (VB.CareerUI && VB.CareerUI.isOpen && VB.CareerUI.isOpen()) || (VB.Account && VB.Account.isOpen && VB.Account.isOpen()) || (VB.Install && VB.Install.isOpen && VB.Install.isOpen());
    if (!top && U.menuPage() === p && !o) return true;   // ya está (otro tamaño de la misma pantalla)
    await ensureMenu();
    if (p === 'play' || p === 'quick' || p === 'gym' || p === 'online') { U.menuGo('play'); await idle(); }
    if (p !== 'play') { U.menuGo(p, o); await idle(); }
    await sleep(60);
    return U.menuPage() === p;
  }
  /** Panel de ui.js por su botón del menú (set, ctl, tut, squad, about, first), su hoja (#pnSet…) y, si se da, la pestaña. */
  async function panel(btn, pane, tabsHost, tab) {
    var U = VB.UI;
    if (!U.isPanelOpen() || !shown(pane)) { await ensureMenu(); if (!click(btn)) return false; await idle(); await sleep(60); }
    if (tabsHost && tab) { var b = document.querySelector(tabsHost + ' [data-tab="' + tab + '"]'); if (!b) return false; b.click(); await sleep(80); }
    return U.isPanelOpen() && shown(pane);
  }
  /** Cómo se juega en el paso k (0…): Siguiente / Anterior hasta llegar (los puntos dicen dónde estás). */
  async function tutStep(k) {
    if (!VB.UI.isPanelOpen() || !shown('#pnTut')) { await ensureMenu(); click('#btnTut'); await idle(); await sleep(60); }
    for (var i = 0; i < 40; i++) {
      var dots = [].slice.call(document.querySelectorAll('#tutDots i')), cur = dots.findIndex(function (d) { return d.classList.contains('on'); });
      if (k >= dots.length) return false;
      if (cur === k) return true;
      click(cur < k ? '#btnTutNext' : '#btnTutPrev'); await sleep(50);
    }
    return false;
  }
  /** Carrera de muestra (como &mjseed=1): playa o pista, con club y 4 jornadas simuladas. phase 'pick' = sin club (ofertas). */
  function seedCareer(mode, phase) {
    var C = VB.Career; if (!C) return false;
    var has = C.has && C.has(mode);
    if (!has) {
      var o = mode === 'hall' ? { mode: 'hall', name: 'Ares Belmonte', num: 7, seed: 4242, points: 15 } : { mode: 'beach', name: 'Ares Belmonte', num: 7, role: 'cr', points: 21, seed: 4242, ctrl: 'one' };
      var c = C.create(o);
      if (!c) return false;
      if (phase !== 'pick') {
        var oi = 0; (c.offers || []).some(function (x, i) { if (!x.trial) { oi = i; return true; } return false; });
        C.acceptOffer(oi, 2);
        for (var i = 0; i < 4 && C.simulateNext; i++) C.simulateNext(C.get());
      }
    }
    if (C.setMode) C.setMode(mode);
    try { if (VB.UI && VB.UI.refreshMenu) VB.UI.refreshMenu(); } catch (e) { }
    return !!C.get();
  }
  /** Hub de la Carrera en una pestaña (t) y sub-pestaña (s). */
  async function career(t, s) {
    var CU = VB.CareerUI; if (!CU) return false;
    if (VB.UI.isPanelOpen()) await ensureMenu();
    if (!CU.isOpen() || CU._state().view !== 'hub') { await ensureMenu(); CU.open('hub', { from: 'main' }); await sleep(80); }
    if (t) CU._tab(t, s);
    await sleep(60);
    var st = CU._state(); return st.open && (!t || st.tab === t);
  }
  /** Online con ?olmock=1: v = 'list' | 'help' | 'create' | 'room' | 'rival' | otra vista de netlobby (noacc, off, nortc…); o = campos extra. */
  async function online(v, o) {
    var NL = VB.NetLobby; if (!NL || !NL._mock) return false;
    try { localStorage.setItem('make-the-cut.nethelp2', '1'); } catch (e) { }
    if (VB.UI.menuPage() !== 'online') { if (!(await page('online'))) return false; await sleep(500); }
    var st = NL._state();
    if (st.room && v !== 'room' && v !== 'rival') { click('#mpOnline [data-a="leave"]'); await sleep(300); }
    if (v === 'create' || v === 'room') {
      if (!(v === 'room' && NL._state().room)) {
        NL._mock({ view: 'list' }); await sleep(150); click('#mpOnline [data-a="new"]'); await sleep(200);
        if (v === 'room') { click('#mpOnline [data-a="open"]'); await until(function () { return NL._state().view === 'room'; }, 3000); await sleep(200); }
      }
      return NL._state().view === v;
    }
    if (v === 'rival') { if (!(await online('room'))) return false; NL._mock({ arrive: 'Rival de prueba' }); await sleep(900); if (!NL._state().rival) NL._mock({ rival: 'Rival de prueba', status: 'connecting' }); await sleep(150); return NL._state().view === 'room'; }
    var m = Object.assign({ view: v, msg: '', msgBad: false }, o || {});
    NL._mock(m); await sleep(v === 'list' ? 600 : 150);
    return NL._state().view === v;
  }
  window.__MA = { online: online, sleep: sleep, until: until, shown: shown, click: click, idle: idle, ensureMenu: ensureMenu, page: page, panel: panel, tutStep: tutStep, seedCareer: seedCareer, career: career, $: $ };
  return true;
}

function measure(o) {
  o = o || {};
  var W = innerWidth, H = innerHeight;
  var MIN_T = 44, GAP = 8;
  function sel(e) {
    if (!e || e.nodeType !== 1) return '';
    var out = [], n = e;
    for (var d = 0; n && n.nodeType === 1 && d < 3; d++, n = n.parentElement) {
      var s = n.tagName.toLowerCase();
      if (n.id) { out.unshift(s + '#' + n.id); break; }
      var cl = [].slice.call(n.classList || []).filter(function (c) { return !/^(sp-dec|kf|on|in|hit)$/.test(c); }).slice(0, 2);
      if (cl.length) s += '.' + cl.join('.');
      var da = n.getAttribute && (n.getAttribute('data-act') || n.getAttribute('data-a') || n.getAttribute('data-tab'));
      if (da) s += '[' + da + ']';
      out.unshift(s);
    }
    return out.join('>');
  }
  function txt(e) { return String((e.getAttribute && e.getAttribute('aria-label')) || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40); }
  function rnd(v) { return Math.round(v * 10) / 10; }
  function R(r) { return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }
  function cvis(e) { return !e.checkVisibility || e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); }
  // recorte por ancestros: 'out' fuera de un recorte fijo o del viewport, 'scroll' fuera solo por un contenedor con desplazamiento
  function clipState(e, r) {
    var a = { l: r.left, t: r.top, r: r.right, b: r.bottom }, scrolled = false;
    for (var p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if (cs.position === 'fixed') { /* sigue: los fijos también recortan si tienen overflow */ }
      var ox = cs.overflowX, oy = cs.overflowY;
      if (ox === 'visible' && oy === 'visible') continue;
      var pr = p.getBoundingClientRect(), scr = /auto|scroll/.test(ox + oy);
      var inter = !(a.r <= pr.left + 1 || a.l >= pr.right - 1 || a.b <= pr.top + 1 || a.t >= pr.bottom - 1);
      if (!inter) { if (scr) scrolled = true; else return 'out'; }
    }
    if (a.r <= 0 || a.l >= W || a.b <= 0 || a.t >= H) return scrolled ? 'scroll' : 'out';
    return scrolled ? 'scroll' : 'in';
  }
  // rectángulo que se ve de verdad: el de e recortado por los ancestros con overflow no visible (un objetivo que solo asoma en
  // parte por el borde de un contenedor con desplazamiento no «tapa» lo que está fuera de ese contenedor)
  function visRect(e, r) {
    var a = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (var p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      var cs = getComputedStyle(p); if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      var pr = p.getBoundingClientRect();
      if (cs.overflowX !== 'visible') { a.left = Math.max(a.left, pr.left); a.right = Math.min(a.right, pr.right); }
      if (cs.overflowY !== 'visible') { a.top = Math.max(a.top, pr.top); a.bottom = Math.min(a.bottom, pr.bottom); }
    }
    a.width = Math.max(0, a.right - a.left); a.height = Math.max(0, a.bottom - a.top); return a;
  }
  var SKIP = 'svg,script,style,noscript,template,canvas,.sr,.sr-only,.visually-hidden,#fps,#srLive,#offArrow';
  function scaleOf(e) {
    var k = 1;
    for (var n = e; n && n.nodeType === 1; n = n.parentElement) {
      var cs = getComputedStyle(n), tf = cs.transform;
      if (tf && tf !== 'none') { var m = tf.match(/matrix(3d)?(([^)]+))/); if (m) { var v = m[2].split(',').map(parseFloat); k *= Math.hypot(v[0], v[1]) || 1; } }
      if (cs.scale && cs.scale !== 'none') k *= parseFloat(cs.scale) || 1;
      if (cs.zoom && cs.zoom !== 'normal' && cs.zoom !== '1') k *= parseFloat(cs.zoom) || 1;
    }
    return k;
  }
  function related(a, b) { return a === b || a.contains(b) || b.contains(a); }
  // ¿se ve el punto (x,y) de e o lo tapa otra cosa opaca? (con pointer-events forzados: el apilado visual de verdad)
  var peStyle = document.createElement('style'); peStyle.textContent = '*,*::before,*::after{pointer-events:auto!important}';
  function seeThrough(e) {
    if (/^(CANVAS|IMG|VIDEO|svg|SVG|PATH)$/.test(e.tagName)) return false;
    var cs = getComputedStyle(e);
    if (+cs.opacity < 0.15) return true;
    var bg = cs.backgroundColor, tr = !bg || bg === 'transparent' || /rgba\(.*,\s*0(\.0*)?\)$/.test(bg);
    return tr && cs.backgroundImage === 'none' && cs.borderTopWidth === '0px' && cs.boxShadow === 'none' && (cs.backdropFilter || 'none') === 'none' && !cs.maskImage;
  }
  function visibleAt(e, x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    var st = document.elementsFromPoint(x, y);
    for (var i = 0; i < st.length; i++) {
      var h = st[i]; if (h === document.documentElement || h === document.body) return false;
      if (related(h, e)) return true;
      if (!seeThrough(h)) return false;
    }
    return false;
  }
  var res = { vp: W + 'x' + H, fonts: { small12: [], n12: 0, n14: 0, min: null, hist: {}, read14: 0, btn15: 0, tab13: 0, readL: [], btnL: [], tabL: [] }, targets: { n: 0, small: [], tight: [], overlap: [], covered: [] }, clipped: [], off: [], scroll: [], exit: null, primary: null, density: { chars: 0, targets: 0, words: 0 } };
  // (móvil, spec §6.1.1) tier: html.ph / .ph-s / .ph-w; y desplazamiento lateral de la página (§6.1.7)
  var RC = document.documentElement.classList;
  res.tier = { ph: RC.contains('ph'), pv: RC.contains('pv'), s: RC.contains('ph-s'), w: RC.contains('ph-w') };   // (movil-aire ronda 2: pv = móvil en vertical)
  // (ronda 2) aviso de girar visible (partido en juego en vertical): la pantalla no se mide como tal
  try { var rt0 = document.getElementById('rotate'); res.rotate = !!(rt0 && !rt0.hidden && rt0.getClientRects().length); res.rotateGame = !!(window.VB && VB.ctx && VB.ctx.portraitBlock); } catch (e) { }
  var se = document.scrollingElement || document.documentElement;
  res.hscroll = se.scrollWidth > W + 1;

  // ---------------- (a) letra visible
  document.head.appendChild(peStyle);
  var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), node, seenEl = new Map(), rng = document.createRange();
  while ((node = tw.nextNode())) {
    var t = node.nodeValue.replace(/\s+/g, ' ').trim(); if (!t) continue;
    var pe = node.parentElement; if (!pe || pe.closest(SKIP)) continue;
    if (!cvis(pe)) continue;
    var pbr = pe.getBoundingClientRect(); if (pbr.width <= 2 || pbr.height <= 2) continue;   // (solo para lectores de pantalla: 1×1 recortado)
    rng.selectNodeContents(node); var rr = rng.getBoundingClientRect();
    if (rr.width < 1 || rr.height < 1) continue;
    var cst = clipState(pe, rr); if (cst === 'out') continue;
    var cs = getComputedStyle(pe), fs = parseFloat(cs.fontSize) || 0;
    // escala por transformaciones de la cadena de ancestros (transform: scale, propiedad scale, zoom); los giros no cuentan
    var sc = scaleOf(pe);
    var efs = rnd(fs * sc);
    if (cst === 'in') {
      var cx = Math.min(W - 1, Math.max(0, rr.left + Math.min(rr.width, 20) / 2)), cy = Math.min(H - 1, Math.max(0, rr.top + rr.height / 2));
      if (!visibleAt(pe, cx, cy)) continue;
      res.density.chars += t.length; res.density.words += t.split(' ').length;
    }
    var rec = seenEl.get(pe);
    if (rec) { rec.t = (rec.t + ' ' + t).slice(0, 48); continue; }
    rec = { s: sel(pe), t: t.slice(0, 48), px: efs, css: rnd(fs), sc: rnd(sc), scroll: cst === 'scroll' || undefined };
    seenEl.set(pe, rec);
    var b = Math.floor(efs); res.fonts.hist[b] = (res.fonts.hist[b] || 0) + 1;
    if (res.fonts.min == null || efs < res.fonts.min) res.fonts.min = efs;
    if (efs < 14) res.fonts.n14++;
    if (efs < 12) { res.fonts.n12++; res.fonts.small12.push(rec); }
    // (móvil, spec §6.1.2) lectura ≥ 14, rótulos de fila / botón ≥ 15, pestañas ≥ 13 — solo lo que se ve entero
    if (cst === 'in') {
      if (efs < 14 && pe.closest('p,.sp-help-full,.sp-sh-b,.msg,.ol-note')) { res.fonts.read14++; if (res.fonts.readL.length < 12) res.fonts.readL.push(rec); }
      if (efs < 15 && pe.closest('.sp-btn .sp-t,.sp-lrow .sp-t')) { res.fonts.btn15++; if (res.fonts.btnL.length < 12) res.fonts.btnL.push(rec); }
      if (efs < 13 && pe.closest('.tab,.sp-tab')) { res.fonts.tab13++; if (res.fonts.tabL.length < 12) res.fonts.tabL.push(rec); }
    }
  }
  res.fonts.nodes = seenEl.size;
  res.fonts.small12.sort(function (a, b) { return a.px - b.px; }); res.fonts.small12 = res.fonts.small12.slice(0, 40);

  // ---------------- (b, e) objetivos táctiles
  var EXPL = 'button,a[href],[role=button],[role=tab],[role=switch],[role=option],[role=link],input:not([type=hidden]),select,textarea,.sp-btn,.sp-patch,.sp-stamp,.sp-ticket,.sp-back,.sp-tab,[data-act],[data-a],[data-d],[data-go],[data-pick],[data-drill],button[data-tab],[data-sn],[data-ac],[data-in],[onclick]';
  var cand = new Set([].slice.call(document.querySelectorAll(EXPL)));
  // con cursor:pointer propio (no heredado)
  var all = document.body.getElementsByTagName('*');
  for (var ai = 0; ai < all.length; ai++) {
    var el = all[ai]; if (cand.has(el)) continue;
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    if (el.closest(SKIP)) continue;
    var c1 = getComputedStyle(el).cursor; if (c1 !== 'pointer') continue;
    var pp = el.parentElement; if (pp && getComputedStyle(pp).cursor === 'pointer') continue;
    cand.add(el);
  }
  document.head.removeChild(peStyle);
  var T = [];
  cand.forEach(function (e) {
    if (e.closest('[aria-hidden="true"]') && !e.matches('button,a')) return;
    if (e.matches('[tabindex="-1"][aria-hidden="true"]')) return;
    if (e.closest('[inert]')) return;   // (ronda 2, carrera-marco-v: detrás de una hoja vertical —inert— no se toca ni se mide)
    if (!cvis(e)) return;
    var cs = getComputedStyle(e); if (cs.pointerEvents === 'none') return;
    var r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
    if (r.width * r.height > 0.8 * W * H) return;   // capas a pantalla completa (tocar en cualquier sitio), no botones
    var st = clipState(e, r); if (st === 'out') return;
    // (movil-aire §3.13) el interruptor de fitSeg (.sp-toggle.ph-proxy) se toca en TODA su fila (.ph-trow, splat.js segRow): se mide la fila,
    // no el dibujo de 52×30. La flecha del final de un selector (.arr.end, sin más opciones a ese lado) cuenta como desactivada.
    var tr = e.matches('.sp-toggle.ph-proxy') && e.closest('.ph-trow'), rs = r;
    if (tr) { var rr0 = tr.getBoundingClientRect(); if (rr0.width >= r.width && rr0.height >= r.height) rs = rr0; }
    T.push({ e: e, r: r, rs: rs, vr: visRect(e, r), st: st, dis: !!e.disabled || e.getAttribute('aria-disabled') === 'true' || e.matches('.arr.end') });
  });
  // un objetivo dentro de otro objetivo: se queda solo si es un control explícito propio (flechas, pestañas…)
  T = T.filter(function (a) {
    for (var p = a.e.parentElement; p; p = p.parentElement) if (cand.has(p) && T.some(function (b) { return b.e === p; })) return a.e.matches('button,a[href],[role=tab],[role=switch],[data-d],[data-act],[data-a],input,select');
    return true;
  });
  var vis = T.filter(function (a) { return a.st === 'in'; });
  res.targets.n = vis.length; res.density.targets = vis.length;
  vis.forEach(function (a) {
    var r = a.r, v = a.vr, cx = v.left + v.width / 2, cy = v.top + v.height / 2;   // (el centro de lo que se ve)
    a.hit = false;
    if (cx >= 0 && cy >= 0 && cx < W && cy < H) { var h = document.elementFromPoint(cx, cy); a.hit = !!h && (h === a.e || a.e.contains(h)); }
    var info = { s: sel(a.e), t: txt(a.e), r: R(r) };
    if ((a.rs.width < MIN_T || a.rs.height < MIN_T) && !a.dis) res.targets.small.push(info);
    if (!a.hit && !a.dis) res.targets.covered.push(info);
  });
  for (var i = 0; i < vis.length; i++) for (var j = i + 1; j < vis.length; j++) {
    var A = vis[i], B = vis[j]; if (related(A.e, B.e)) continue;
    var ix = Math.min(A.vr.right, B.vr.right) - Math.max(A.vr.left, B.vr.left), iy = Math.min(A.vr.bottom, B.vr.bottom) - Math.max(A.vr.top, B.vr.top);   // (con lo que se ve)
    if (ix > 2 && iy > 2) { if (res.targets.overlap.length < 30) res.targets.overlap.push({ a: sel(A.e), b: sel(B.e), area: Math.round(ix * iy) }); continue; }
    var gap = Math.max(-ix, -iy, 0);
    if (ix > -GAP && iy > -GAP && gap < GAP) { if (res.targets.tight.length < 30) res.targets.tight.push({ a: sel(A.e), b: sel(B.e), gap: rnd(gap) }); }
  }
  res.targets.small = res.targets.small.slice(0, 40); res.targets.covered = res.targets.covered.slice(0, 20);
  res.targets.nSmall = vis.filter(function (a) { return !a.dis && (a.rs.width < MIN_T || a.rs.height < MIN_T); }).length;
  // objetivos desmesurados (> 35 % de la pantalla: una fila que se come la página)
  res.targets.huge = vis.filter(function (a) { var r = a.r, w = Math.min(r.right, W) - Math.max(r.left, 0), h = Math.min(r.bottom, H) - Math.max(r.top, 0); return w > 0 && h > 0 && w * h > 0.35 * W * H; }).map(function (a) { return { s: sel(a.e), t: txt(a.e), r: R(a.r) }; });
  res.targets.nTight = res.targets.tight.length; res.targets.nOverlap = res.targets.overlap.length;

  // ---------------- (c) recortes: elipsis, line-clamp, overflow oculto con texto, y fuera del viewport
  // (ronda 2, §8.3) permitidos = los que tienen un antepasado con data-trunc="name" (nombre propio largo en una lista, la ficha a un toque)
  // o data-trunc="preview" (vista previa cortada por palabra, SP.cutWords): van aparte (res.clippedOk); los demás cuentan como recorte y
  // se apuntan con el texto ENTERO (res.clipped[].full). Recorte 'o' = contenedor con overflow hidden/clip cuyo hijo con texto (o tabla)
  // se sale de él (columna Nota de una tabla, chips «Caducan al j»): el texto del hijo cortado.
  function fullTxt(e) { return String(e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200); }
  function truncOk(e) { var a = e.closest && e.closest('[data-trunc]'); return !!a && /^(name|preview)$/.test(a.getAttribute('data-trunc')); }
  res.clippedOk = []; res.nClippedOk = 0;
  var clipSeen = new Set();
  function addClip(e, kind, extra) {
    if (clipSeen.has(e)) return false; clipSeen.add(e);
    var it = Object.assign({ s: sel(e), kind: kind, t: txt(e), full: fullTxt(e), sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight }, extra || {});
    if (truncOk(e)) { res.nClippedOk++; if (res.clippedOk.length < 30) res.clippedOk.push(it); return false; }
    nClip++; if (kind === 'o') res.nClipO = (res.nClipO || 0) + 1; if (res.clipped.length < 30) res.clipped.push(it);   // (nClipO: los 'o', para comparar con pasadas viejas sin ellos)
    return true;
  }
  function xMute(e, cs) {
    if (!/auto|scroll/.test(cs.overflowX) || e.scrollWidth <= e.clientWidth + 2) return false;
    if (e.classList.contains('sp-more-x') || e.matches('.tb-row,.pv-strip,.sp-tabs-strip,.sp-tabs-strip *,.sp-tbl,.sp-tbl-full') || e.closest('.sp-sheet .sp-tbl-full')) return false;
    var mk = cs.maskImage && cs.maskImage !== 'none' ? cs.maskImage : cs.webkitMaskImage && cs.webkitMaskImage !== 'none' ? cs.webkitMaskImage : '';
    return !mk;
  }
  var els = document.body.getElementsByTagName('*'), nClip = 0;
  for (var k2 = 0; k2 < els.length; k2++) {
    var e2 = els[k2];
    if (e2.closest(SKIP) || /^(SCRIPT|STYLE|CANVAS|IMG|svg|BR)$/.test(e2.tagName)) continue;
    if (!e2.firstChild) continue;
    var r2 = e2.getBoundingClientRect(); if (r2.width < 2 || r2.height < 2) continue;
    if (!cvis(e2)) continue;
    var cs2 = getComputedStyle(e2), kind = '';
    var ownTxt = [].some.call(e2.childNodes, function (n) { return n.nodeType === 3 && n.nodeValue.trim(); });
    var hasTxt = ownTxt || (e2.textContent || '').trim().length > 0;
    if (!hasTxt) continue;
    var cst2 = clipState(e2, r2); if (cst2 !== 'in') continue;
    if (cs2.textOverflow === 'ellipsis' && e2.scrollWidth > e2.clientWidth + 1) kind = 'ellipsis';
    else if (cs2.webkitLineClamp && cs2.webkitLineClamp !== 'none' && e2.scrollHeight > e2.clientHeight + 1) kind = 'line-clamp';
    else if (ownTxt && /hidden|clip/.test(cs2.overflowX + cs2.overflowY) && (e2.scrollWidth > e2.clientWidth + 2 || e2.scrollHeight > e2.clientHeight + 3) && cs2.display !== 'inline') kind = 'overflow';
    if (kind) addClip(e2, kind);
    // (ronda 2) recorte 'o': overflow hidden/clip sin texto propio pero con hijos de texto (o una tabla) que se salen de la caja; o una fila que
    // se desplaza de lado SIN señal de que hay más (sin desvanecido .sp-more-x ni máscara; no las tiras de pestañas): «Caducan al j» de cesiones
    else if (!ownTxt && (/hidden|clip/.test(cs2.overflowX + cs2.overflowY) ? (e2.scrollWidth > e2.clientWidth + 2 || e2.scrollHeight > e2.clientHeight + 2) : xMute(e2, cs2)) && cs2.display !== 'inline') {
      var cr = e2.getBoundingClientRect(), bl = parseFloat(cs2.borderLeftWidth) || 0, bt = parseFloat(cs2.borderTopWidth) || 0;
      var box = { l: cr.left + bl, t: cr.top + bt, r: cr.left + bl + e2.clientWidth, b: cr.top + bt + e2.clientHeight };
      // (lo que se sale de lado en una fila que se desplaza CON señal —desvanecido o máscara— se alcanza desplazando: no es recorte)
      var hx = /hidden|clip/.test(cs2.overflowX) || (/auto|scroll/.test(cs2.overflowX) && xMute(e2, cs2)), hy = /hidden|clip/.test(cs2.overflowY);
      var tw2 = document.createTreeWalker(e2, NodeFilter.SHOW_TEXT, null), tn, cut = null;
      while (!cut && (tn = tw2.nextNode())) {
        if (!tn.nodeValue.trim()) continue;
        var tp = tn.parentElement; if (!tp || tp === e2 || tp.closest(SKIP) || !cvis(tp) || clipSeen.has(tp) || tp.closest('[role=tab],.tab')) continue;   // (las pestañas de una tira asoman en el borde a propósito)
        var ct = getComputedStyle(tp), selfCut = tp.scrollWidth > tp.clientWidth + 1 || tp.scrollHeight > tp.clientHeight + 2;
        if (selfCut && (ct.textOverflow === 'ellipsis' || (ct.webkitLineClamp && ct.webkitLineClamp !== 'none') || /hidden|clip/.test(ct.overflowX + ct.overflowY))) continue;   // (se recorta él mismo: se mide él solo)
        // (dentro de un desplazable propio, no es recorte: se llega desplazando)
        var inS = false; for (var q2 = tp; q2 && q2 !== e2; q2 = q2.parentElement) { var cq = getComputedStyle(q2); if (/auto|scroll/.test(cq.overflowX + cq.overflowY)) { inS = true; break; } if (q2 !== tp && /hidden|clip/.test(cq.overflowX + cq.overflowY)) { inS = true; break; } }
        if (inS) continue;
        var rg = document.createRange(); rg.selectNodeContents(tn); var tr2 = rg.getBoundingClientRect(); if (tr2.width < 1 || tr2.height < 1) continue;
        var outX = hx && (tr2.right > box.r + 2 || tr2.left < box.l - 2), outY = hy && (tr2.bottom > box.b + 2 || tr2.top < box.t - 2);
        // (fuera del todo = otro problema —«fuera»—; aquí, lo que asoma a medias o se corta en el borde)
        var inter = tr2.right > box.l && tr2.left < box.r && tr2.bottom > box.t && tr2.top < box.b;
        if ((outX || outY) && (inter || e2.querySelector('table'))) cut = tp;
      }
      if (cut) addClip(cut, 'o', { box: sel(e2) });
    }
    // (móvil, spec §6.1.3) elipsis que corta información: todas menos la ayuda de una fila (.sp-lrow .sp-s), [data-ph-ell] y data-trunc
    if (kind === 'ellipsis' && !(e2.closest('.sp-s') && e2.closest('.sp-lrow')) && !e2.closest('[data-ph-ell]') && !truncOk(e2)) { res.nEllBad = (res.nEllBad || 0) + 1; if ((res.ellBad = res.ellBad || []).length < 15) res.ellBad.push({ s: sel(e2), t: txt(e2) }); }
    // fuera del viewport (texto u objetivo) sin un contenedor que se desplace para llegar
    if ((ownTxt || cand.has(e2)) && (r2.right > W + 1 || r2.bottom > H + 1 || r2.left < -1 || r2.top < -1)) {
      var inScroll = false;
      for (var p2 = e2.parentElement; p2 && p2 !== document.body; p2 = p2.parentElement) { var c3 = getComputedStyle(p2); if (/auto|scroll/.test(c3.overflowX + c3.overflowY) && (p2.scrollHeight > p2.clientHeight + 2 || p2.scrollWidth > p2.clientWidth + 2)) { inScroll = true; break; } }
      if (!inScroll && res.off.length < 30) res.off.push({ s: sel(e2), t: txt(e2), r: R(r2) });
    }
  }
  res.nClipped = nClip; res.nOff = res.off.length;

  // ---------------- (d) salida / acción principal
  function pick(selector, rx) {
    var L = [];
    if (selector) L = [].slice.call(document.querySelectorAll(selector));
    else {
      L = T.map(function (a) { return a.e; }).filter(function (e) {
        if (e.matches('.sp-back,#btnPanelBack,.mp-back,.cr-back,[data-act=close],[aria-label="Cerrar"],[data-ac=close],[data-in=close]')) return true;
        return rx.test(txt(e));
      });
    }
    var best = null;
    L.forEach(function (e) {
      if (!cvis(e)) return; var r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2, h = cx >= 0 && cy >= 0 && cx < W && cy < H ? document.elementFromPoint(cx, cy) : null;
      var hit = !!h && (h === e || e.contains(h)), inside = r.left >= -1 && r.top >= -1 && r.right <= W + 1 && r.bottom <= H + 1;
      var it = { s: sel(e), t: txt(e), r: R(r), inside: inside, hit: hit, ok: inside && hit };
      if (!best || (it.ok && !best.ok)) best = it;
    });
    return best;
  }
  res.exit = o.exit === '' ? null : pick(o.exit, /^(‹\s*)?(volver|cerrar|salir|men[uú]|seguir jugando|continuar|entendido|vale|listo|ahora no|m[aá]s tarde|saltar|omitir|terminar|cancelar|lista|pausa)/i);
  res.primary = o.primary === '' ? null : pick(o.primary || '.sp-patch', /^$/);
  if (!o.primary && !res.primary) res.primary = null;

  // ---------------- (f) contenedores con desplazamiento
  for (var k3 = 0; k3 < els.length; k3++) {
    var e3 = els[k3]; var cs4 = getComputedStyle(e3);
    if (!/auto|scroll/.test(cs4.overflowX + cs4.overflowY)) continue;
    if (!cvis(e3)) continue;
    var r3 = e3.getBoundingClientRect(); if (r3.width < 10 || r3.height < 10) continue;
    if (clipState(e3, r3) === 'out') continue;
    var needY = /auto|scroll/.test(cs4.overflowY) && e3.scrollHeight > e3.clientHeight + 2, needX = /auto|scroll/.test(cs4.overflowX) && e3.scrollWidth > e3.clientWidth + 2;
    res.scroll.push({ s: sel(e3), r: R(r3), sh: e3.scrollHeight, ch: e3.clientHeight, sw: e3.scrollWidth, cw: e3.clientWidth, needY: needY, needX: needX });
  }
  res.scroll = res.scroll.slice(0, 12);
  res.nScrollNeed = res.scroll.filter(function (s) { return s.needY || s.needX; }).length;
  // (móvil, spec §6.1.7) fila de pestañas que no cabe: error salvo .sp-vtabs o .sp-tabs-strip con su desvanecido (.sp-more-x)
  res.tabOver = [];
  [].forEach.call(document.querySelectorAll('.tabs .tb-row,.sp-tabs .tb-row,.sp-tabs-strip .tb-row'), function (r) {
    if (!cvis(r) || r.getBoundingClientRect().width < 10 || r.scrollWidth <= r.clientWidth + 2) return;
    var host = r.closest('.tabs,.sp-tabs,.sp-tabs-strip');
    if (host && host.classList.contains('sp-vtabs')) return;
    // (ronda 2, carrera-marco-v) en vertical la tira de la Carrera es .pv-tstrip, con desvanecido + chevrón en el borde (.cr-ml / .cr-mr)
    var strip = !!host && (host.classList.contains('sp-tabs-strip') || host.classList.contains('pv-tstrip'));
    if (strip && (r.classList.contains('sp-more-x') || host.classList.contains('cr-mr') || host.classList.contains('cr-ml'))) return;
    if (r.scrollLeft + r.clientWidth >= r.scrollWidth - 2 && r.scrollLeft > 0 && strip) return;   // (al final de la tira)
    res.tabOver.push({ s: sel(host || r), sw: r.scrollWidth, cw: r.clientWidth });
  });
  // (movil-aire §3.13) rótulos NO tocables que se montan unos sobre otros (seña del árbitro, aviso del saque, cinta, consejo, tira de fases)
  res.rot = { n: 0, list: [] };
  var ROT = [].slice.call(document.querySelectorAll('#pbug,.sp-sena,#prompt,#banner,#coach,#touchbar')).filter(function (e) {
    if (!cvis(e)) return false; var r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && clipState(e, r) === 'in';
  });
  for (var ri = 0; ri < ROT.length; ri++) for (var rj = ri + 1; rj < ROT.length; rj++) {
    var ea = ROT[ri], eb = ROT[rj]; if (related(ea, eb)) continue;
    var ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
    var ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 2 && oy > 2) { res.rot.n++; if (res.rot.list.length < 10) res.rot.list.push({ a: sel(ea), b: sel(eb), area: Math.round(ox * oy) }); }
  }
  // (ronda 2) «pisados»: rótulos de texto NO tocables que se montan unos sobre otros dentro del mismo panel (Ataque/Bloqueo/Saque de Cifras
  // a 568): por el núcleo de cada línea de texto (getClientRects del rango), entre elementos sin parentesco, con más de 3×3 px y 24 px² en común
  res.pis = { n: 0, list: [] };
  var PG0 = new Map(), TGT = EXPL + ',.sp-btn,.sp-tab,.tab,label';
  seenEl.forEach(function (rec, pe) {
    if (rec.scroll || pe.closest(TGT)) return;
    var L = [];
    for (var cn = pe.firstChild; cn; cn = cn.nextSibling) {
      if (cn.nodeType !== 3 || !cn.nodeValue.trim()) continue;
      rng.selectNodeContents(cn); var rs0 = rng.getClientRects();
      // (el núcleo de la línea: el 56 % del centro; la caja entera de las letras de rótulo, con interlineado < 1, siempre roza la de arriba)
      for (var ri0 = 0; ri0 < rs0.length; ri0++) { var q0 = rs0[ri0]; if (q0.width >= 2 && q0.height >= 2) { var ins = q0.height * 0.22; L.push({ left: q0.left, right: q0.right, top: q0.top + ins, bottom: q0.bottom - ins }); } }
    }
    if (!L.length) return;
    var grp = pe.closest('.sp-panel,.sp-sheet,#panel,.card,[role=dialog],section,#end,#pause,#menu,#career') || document.body;
    if (!PG0.has(grp)) PG0.set(grp, []);
    PG0.get(grp).push({ e: pe, r: L });
  });
  PG0.forEach(function (arr) {
    if (arr.length > 400) arr = arr.slice(0, 400);
    for (var pi = 0; pi < arr.length; pi++) for (var pj = pi + 1; pj < arr.length; pj++) {
      var A1 = arr[pi], B1 = arr[pj]; if (related(A1.e, B1.e)) continue;
      var hitP = 0;
      for (var a1 = 0; a1 < A1.r.length && !hitP; a1++) for (var b1 = 0; b1 < B1.r.length && !hitP; b1++) {
        var ra1 = A1.r[a1], rb1 = B1.r[b1], ox1 = Math.min(ra1.right, rb1.right) - Math.max(ra1.left, rb1.left), oy1 = Math.min(ra1.bottom, rb1.bottom) - Math.max(ra1.top, rb1.top);
        if (ox1 > 3 && oy1 > 3 && ox1 * oy1 > 24) hitP = Math.round(ox1 * oy1);
      }
      if (hitP) { res.pis.n++; if (res.pis.list.length < 12) res.pis.list.push({ a: sel(A1.e), at: txt(A1.e), b: sel(B1.e), bt: txt(B1.e), area: hitP }); }
    }
  });
  // (móvil, spec §6.1.6, solo aviso) alcance: la acción principal abajo a la derecha (x > 50 %, y > 55 %)
  // (ronda 2, menus-v) en vertical la zona del pulgar es el tercio de abajo, a todo el ancho (la acción principal va en un dock de borde a
  // borde: su centro cae justo en la mitad); en apaisado, abajo a la derecha como siempre
  if (res.primary && res.primary.r) { var pr = res.primary.r; res.reach = H > W ? (pr.y + pr.h / 2) > H * 2 / 3 : (pr.x + pr.w / 2) > W * 0.5 && (pr.y + pr.h / 2) > H * 0.55; }
  return res;
}

/** (móvil, spec §6.1.5) Lleva al final cada zona que se desplaza (.sp-scroll y cualquier overflow-y auto/scroll con contenido de más) y
 *  devuelve cuántas movió; mobaudit.js mide después otra vez la salida y la acción principal (no se pueden ir con el contenido). */
function scrollAll() {
  var n = 0, all = document.body.getElementsByTagName('*');
  for (var i = 0; i < all.length; i++) {
    var e = all[i], cs = getComputedStyle(e);
    if (!/auto|scroll/.test(cs.overflowY) || e.scrollHeight <= e.clientHeight + 2 || e.clientHeight < 10) continue;
    if (e === document.body || e === document.documentElement) continue;
    e.scrollTop = e.scrollHeight; n++;
  }
  return n;
}

/** (ronda 2, §8.3) «tapado por el pie»: tras llevar cada zona al final (scrollAll), texto visible que sigue debajo de (i) algo opaco fijo
 *  de la parte de abajo que no es de su zona (dock, .pv-tabbar, barra de acciones; no capas a pantalla completa ni velos) o (ii) el
 *  desvanecido de fin de scroll de su zona (.sp-more que ya no puede bajar más: overflow oculto o al final). Devuelve {n, list}. */
function footCover() {
  var W = innerWidth, H = innerHeight, out = { n: 0, list: [] };
  var SKIP = 'svg,script,style,noscript,template,canvas,.sr,.sr-only,.visually-hidden,#fps,#srLive,#offArrow';
  function cvis(e) { return !e.checkVisibility || e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); }
  function related(a, b) { return a === b || a.contains(b) || b.contains(a); }
  function sel(e) { var s = e.tagName.toLowerCase(); if (e.id) return s + '#' + e.id; var c = [].slice.call(e.classList || []).slice(0, 2); return s + (c.length ? '.' + c.join('.') : ''); }
  function seeThrough(e) {
    if (/^(CANVAS|IMG|VIDEO|svg|SVG|PATH)$/.test(e.tagName)) return false;
    var cs = getComputedStyle(e); if (+cs.opacity < 0.15) return true;
    var bg = cs.backgroundColor, tr = !bg || bg === 'transparent' || /rgba\(.*,\s*0(\.0*)?\)$/.test(bg);
    return tr && cs.backgroundImage === 'none' && cs.borderTopWidth === '0px' && cs.boxShadow === 'none' && (cs.backdropFilter || 'none') === 'none' && !cs.maskImage;
  }
  function zoneOf(e) {
    for (var p = e.parentElement; p && p !== document.body; p = p.parentElement) { var cs = getComputedStyle(p); if (/auto|scroll/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 2) return p; }   // (la que se desplaza en vertical de verdad)
    return null;
  }
  var pe0 = document.createElement('style'); pe0.textContent = '*,*::before,*::after{pointer-events:auto!important}'; document.head.appendChild(pe0);
  // ¿la zona está delante? (su borde de arriba no lo tapa nada opaco que no sea suyo)
  var fgC = new Map();
  function fg(z) {
    if (fgC.has(z)) return fgC.get(z);
    var zr = z.getBoundingClientRect(), x = Math.min(W - 1, Math.max(0, zr.left + zr.width / 2)), y = Math.min(H - 1, Math.max(0, zr.top + Math.min(12, zr.height / 2))), ok = true;
    var st = document.elementsFromPoint(x, y);
    for (var i = 0; i < st.length; i++) { var h = st[i]; if (h === document.documentElement || h === document.body) break; if (related(h, z)) break; if (!seeThrough(h)) { ok = false; break; } }
    fgC.set(z, ok); return ok;
  }
  var seen = new Set(), tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n, rg = document.createRange();
  while ((n = tw.nextNode())) {
    var t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (!t) continue;
    var pe = n.parentElement; if (!pe || seen.has(pe) || pe.closest(SKIP) || pe.closest('[inert],[aria-hidden="true"]') || !cvis(pe)) continue;
    rg.selectNodeContents(n); var r = rg.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) continue;
    seen.add(pe);
    var z = zoneOf(pe), zr0 = z ? z.getBoundingClientRect() : { top: 0, bottom: H }, zr = { top: Math.max(0, zr0.top), bottom: Math.min(H, zr0.bottom) }; zr.height = Math.max(1, zr.bottom - zr.top);   // (lo que se ve de la zona)
    if (r.top >= zr.bottom - 1 || r.bottom <= zr.top + 1) continue;   // (fuera de su zona: no se ve, no lo tapa nada)
    var cx = Math.min(W - 1, Math.max(0, r.left + Math.min(r.width, 24) / 2)), cy = Math.min(H - 1, Math.max(0, Math.min(r.top + r.height / 2, zr.bottom - 2)));
    var st = document.elementsFromPoint(cx, cy), by = null;
    for (var i = 0; i < st.length; i++) {
      var h = st[i]; if (h === document.documentElement || h === document.body) break;
      if (related(h, pe)) break;
      if (!seeThrough(h)) { by = h; break; }
    }
    var why = '';
    // (solo contenido de una zona que se desplaza y que está delante: lo de debajo de un menú, un aviso o el HUD del partido no cuenta)
    if (by && z && fg(z) && !z.contains(by) && !related(by, z) && !by.matches('.sp-catch,.pv-veil') && !by.closest('#spSheets,#rotate')) {
      var br = by.getBoundingClientRect();
      if (br.height < H * 0.6 && br.top >= zr.top + zr.height * 0.4 && r.top >= zr.top + zr.height * 0.4) why = 'pie';   // (abajo de lo que se ve; lo que pasa por debajo de una cabecera pegada arriba, al desplazar, no)
    }
    // (ii) desvanecido de fin de scroll que ya no se puede apartar
    var fa = pe.closest('.sp-more,.more');   // (.more: la hoja final, ui.js endMore)
    if (!why && fa && fg(fa)) {
      var fcs = getComputedStyle(fa), canDown = /auto|scroll/.test(fcs.overflowY) && fa.scrollTop + fa.clientHeight < fa.scrollHeight - 2;
      if (!canDown) {
        var aft = getComputedStyle(fa, '::after'), mk = fcs.maskImage && fcs.maskImage !== 'none' ? fcs.maskImage : fcs.webkitMaskImage && fcs.webkitMaskImage !== 'none' ? fcs.webkitMaskImage : '';
        var mm = /calc\(100% - ([\d.]+)px\)/.exec(mk), fh = aft.content && aft.content !== 'none' && aft.content !== 'normal' ? parseFloat(aft.height) || 0 : mk ? (mm ? +mm[1] : 24) : 0;
        var fr = fa.getBoundingClientRect(), fb = fr.top + (parseFloat(fcs.borderTopWidth) || 0) + fa.clientHeight;
        if (fh > 0 && r.bottom > fb - fh + 2 && r.top < fb) { why = 'fade'; by = fa; }
      }
    }
    if (why) { out.n++; if (out.list.length < 15) out.list.push({ s: sel(pe), t: t.slice(0, 60), why: why, by: by ? sel(by) : '' }); }
  }
  document.head.removeChild(pe0);
  return out;
}

// (espejo de scrollAll) todo lo desplazable vuelve al principio antes de abrir la siguiente pantalla
function resetScroll() {
  var n = 0, all = document.body.getElementsByTagName('*');
  for (var i = 0; i < all.length; i++) {
    var e = all[i], cs = getComputedStyle(e);
    if (!/auto|scroll/.test(cs.overflowY + ' ' + cs.overflowX)) continue;
    if (e.scrollTop || e.scrollLeft) { e.scrollTop = 0; e.scrollLeft = 0; n++; }
  }
  return n;
}

module.exports = { helpers: helpers, measure: measure, scrollAll: scrollAll, resetScroll: resetScroll, footCover: footCover };
