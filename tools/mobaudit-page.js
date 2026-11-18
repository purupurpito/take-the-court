/* MAKE THE CUT — tools/mobaudit-page.js (owner: ui_main)
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
  res.tier = { ph: RC.contains('ph'), s: RC.contains('ph-s'), w: RC.contains('ph-w') };
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
    if (!cvis(e)) return;
    var cs = getComputedStyle(e); if (cs.pointerEvents === 'none') return;
    var r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
    if (r.width * r.height > 0.8 * W * H) return;   // capas a pantalla completa (tocar en cualquier sitio), no botones
    var st = clipState(e, r); if (st === 'out') return;
    T.push({ e: e, r: r, st: st, dis: !!e.disabled || e.getAttribute('aria-disabled') === 'true' });
  });
  // un objetivo dentro de otro objetivo: se queda solo si es un control explícito propio (flechas, pestañas…)
  T = T.filter(function (a) {
    for (var p = a.e.parentElement; p; p = p.parentElement) if (cand.has(p) && T.some(function (b) { return b.e === p; })) return a.e.matches('button,a[href],[role=tab],[role=switch],[data-d],[data-act],[data-a],input,select');
    return true;
  });
  var vis = T.filter(function (a) { return a.st === 'in'; });
  res.targets.n = vis.length; res.density.targets = vis.length;
  vis.forEach(function (a) {
    var r = a.r, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    a.hit = false;
    if (cx >= 0 && cy >= 0 && cx < W && cy < H) { var h = document.elementFromPoint(cx, cy); a.hit = !!h && (h === a.e || a.e.contains(h)); }
    var info = { s: sel(a.e), t: txt(a.e), r: R(r) };
    if ((r.width < MIN_T || r.height < MIN_T) && !a.dis) res.targets.small.push(info);
    if (!a.hit && !a.dis) res.targets.covered.push(info);
  });
  for (var i = 0; i < vis.length; i++) for (var j = i + 1; j < vis.length; j++) {
    var A = vis[i], B = vis[j]; if (related(A.e, B.e)) continue;
    var ix = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), iy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
    if (ix > 2 && iy > 2) { if (res.targets.overlap.length < 30) res.targets.overlap.push({ a: sel(A.e), b: sel(B.e), area: Math.round(ix * iy) }); continue; }
    var gap = Math.max(-ix, -iy, 0);
    if (ix > -GAP && iy > -GAP && gap < GAP) { if (res.targets.tight.length < 30) res.targets.tight.push({ a: sel(A.e), b: sel(B.e), gap: rnd(gap) }); }
  }
  res.targets.small = res.targets.small.slice(0, 40); res.targets.covered = res.targets.covered.slice(0, 20);
  res.targets.nSmall = vis.filter(function (a) { return !a.dis && (a.r.width < MIN_T || a.r.height < MIN_T); }).length;
  // objetivos desmesurados (> 35 % de la pantalla: una fila que se come la página)
  res.targets.huge = vis.filter(function (a) { var r = a.r, w = Math.min(r.right, W) - Math.max(r.left, 0), h = Math.min(r.bottom, H) - Math.max(r.top, 0); return w > 0 && h > 0 && w * h > 0.35 * W * H; }).map(function (a) { return { s: sel(a.e), t: txt(a.e), r: R(a.r) }; });
  res.targets.nTight = res.targets.tight.length; res.targets.nOverlap = res.targets.overlap.length;

  // ---------------- (c) recortes: elipsis, line-clamp, overflow oculto con texto, y fuera del viewport
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
    if (kind) { nClip++; if (res.clipped.length < 30) res.clipped.push({ s: sel(e2), kind: kind, t: txt(e2), sw: e2.scrollWidth, cw: e2.clientWidth, sh: e2.scrollHeight, ch: e2.clientHeight }); }
    // (móvil, spec §6.1.3) elipsis que corta información: todas menos la ayuda de una fila (.sp-lrow .sp-s) y [data-ph-ell]
    if (kind === 'ellipsis' && !(e2.closest('.sp-s') && e2.closest('.sp-lrow')) && !e2.closest('[data-ph-ell]')) { res.nEllBad = (res.nEllBad || 0) + 1; if ((res.ellBad = res.ellBad || []).length < 15) res.ellBad.push({ s: sel(e2), t: txt(e2) }); }
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
    if (host && host.classList.contains('sp-tabs-strip') && r.classList.contains('sp-more-x')) return;
    if (r.scrollLeft + r.clientWidth >= r.scrollWidth - 2 && r.scrollLeft > 0 && host && host.classList.contains('sp-tabs-strip')) return;   // (al final de la tira)
    res.tabOver.push({ s: sel(host || r), sw: r.scrollWidth, cw: r.clientWidth });
  });
  // (móvil, spec §6.1.6, solo aviso) alcance: la acción principal abajo a la derecha (x > 50 %, y > 55 %)
  if (res.primary && res.primary.r) { var pr = res.primary.r; res.reach = (pr.x + pr.w / 2) > W * 0.5 && (pr.y + pr.h / 2) > H * 0.55; }
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

module.exports = { helpers: helpers, measure: measure, scrollAll: scrollAll, resetScroll: resetScroll };
