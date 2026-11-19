#!/usr/bin/env node
/* MAKE THE CUT — tools/googletest.js (owner: ui_main)
 * «Entrar con Google» sin Google de verdad (19-nov-2026). Chrome headless (tools/cdp.js) con un script previo que:
 *  - intercepta los <script> de gstatic.com/firebasejs (no hay red: onload tras __G.delay ms) y pone un window.firebase FALSO;
 *  - fb.auth().signInWithPopup apunta si se llamó DENTRO del clic (window.__inClick, puesto alrededor de el.click()) y responde
 *    según la cola __G.modes ('blocked' = auth/popup-blocked, 'cancel' = popup-closed-by-user, 'ok' = entra con un usuario falso);
 *  - cuenta signInWithRedirect y getRedirectResult (deben quedarse en 0).
 * Comprueba, en móvil apaisado (844x390, táctil) y en PC (1280x720):
 *  1) SDK lento (no precargado a tiempo) + ventana bloqueada → sale la confirmación «Abrir Google» / «Cancelar» (≥ 44 px, letra ≥ 12).
 *  2) «Abrir Google» llama a signInWithPopup en el acto (dentro del clic); si vuelve a bloquearse, se queda con el aviso de ventanas
 *     emergentes; con «cancel» vuelve a la vista de entrar sin mensaje.
 *  3) «Cancelar» vuelve a la vista de entrar (con el formulario).
 *  4) Con el SDK ya precargado (al abrir el panel), el PRIMER toque en «Entrar con Google» llama a signInWithPopup dentro del clic.
 *  5) Nunca signInWithRedirect ni getRedirectResult. Indicador viejo de redirección (gredir): se borra al cargar sin cargar el SDK.
 *  6) 'ok' (Google responde con un usuario falso; la nube va por un fetch falso sin red): se llega a la vista de la cuenta, el SDK se
 *     cierra con signOut y se sube lo local; «Cerrar sesión» vuelve a entrar.
 *  7) 'ok' con la Carrera de la cuenta distinta de la del dispositivo: sale el conflicto de progreso.
 * Uso: node tools/googletest.js   (SHOT=carpeta: capturas de la confirmación). Acaba en «TODO OK» o sale con 1.
 */
'use strict';
const path = require('path');
const CDP = require('./cdp.js');
let fails = 0, oks = 0;
function ok(name, cond, extra) { if (cond) { oks++; console.log('  ok   ' + name + (extra ? '  (' + extra + ')' : '')); } else { fails++; console.log('  FALLO ' + name + (extra ? '  (' + extra + ')' : '')); } }
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 240000).unref();

const INIT = `(function(){
  var G = window.__G = { delay: 40, modes: [], popup: 0, inClick: [], redirect: 0, grr: 0, loads: 0, signOut: 0, patch: 0, net: [], remote: [] };
  var auth = {
    signInWithPopup: function (pr) { G.popup++; G.inClick.push(window.__inClick === true); var m = G.modes.shift() || 'cancel';
      if (m === 'blocked') return Promise.reject({ code: 'auth/popup-blocked', message: 'blocked' });
      if (m === 'ok') return Promise.resolve({ user: { email: 'jugadora.g@correo.es', uid: 'gtest-uid', refreshToken: 'gtest-rt',
        getIdTokenResult: function () { return Promise.resolve({ token: 'gtest-it', expirationTime: new Date(Date.now() + 3600e3).toUTCString() }); } } });
      return Promise.reject({ code: 'auth/popup-closed-by-user', message: 'closed' }); },
    signInWithRedirect: function () { G.redirect++; return new Promise(function () { }); },
    getRedirectResult: function () { G.grr++; return Promise.resolve(null); },
    signOut: function () { G.signOut++; return Promise.resolve(); }
  };
  // la nube, sin red: la lista de partidas devuelve G.remote ([{name, data, at}]) y cada subida (PATCH) se cuenta en G.patch
  var f0 = window.fetch;
  window.fetch = function (url, opt) {
    url = String(url); var m = (opt && opt.method) || 'GET';
    if (/firestore\.googleapis\.com/.test(url)) {
      G.net.push(m);
      if (m === 'PATCH') { G.patch++; return Promise.resolve(new Response('{}', { status: 200 })); }
      var docs = G.remote.map(function (d) { return { name: 'x/saves/' + d.name, fields: { data: { stringValue: d.data }, updatedAt: { integerValue: String(d.at) } } }; });
      return Promise.resolve(new Response(JSON.stringify({ documents: docs }), { status: 200 }));
    }
    if (/identitytoolkit|securetoken/.test(url)) { G.net.push('auth'); return Promise.resolve(new Response('{"error":{"message":"NO_RED"}}', { status: 400 })); }
    return f0.apply(this, arguments);
  };
  function Prov() { this.setCustomParameters = function () { }; }
  var fake = { apps: [], initializeApp: function () { fake.apps.push({}); }, auth: Object.assign(function () { return auth; }, { GoogleAuthProvider: Prov }) };
  var ap = Node.prototype.appendChild;
  Node.prototype.appendChild = function (n) {
    if (n && n.tagName === 'SCRIPT' && /gstatic\\.com\\/firebasejs/.test(n.src || '')) {
      G.loads++; setTimeout(function () { window.firebase = fake; n.onload && n.onload(); }, G.delay); return n;
    }
    return ap.call(this, n);
  };
})();`;

const PAGE = `(function(){
  var W = window;
  W.__click = function (sel) { var b = document.querySelector('#account ' + sel); if (!b) return false; W.__inClick = true; try { b.click(); } finally { W.__inClick = false; } return true; };
  W.__until = function (f, ms) { return new Promise(function (r) { var t0 = Date.now(); (function k() { var v = false; try { v = f(); } catch (e) { } if (v || Date.now() - t0 > ms) r(!!v); else setTimeout(k, 30); })(); }); };
  W.__box = function (sel) { var e = document.querySelector('#account ' + sel); if (!e) return null; var r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return { w: Math.round(r.width), h: Math.round(r.height), fs: parseFloat(cs.fontSize), in: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; };
})();`;

async function run(size, touch) {
  console.log('== ' + size + (touch ? ' (táctil)' : ''));
  const page = await CDP.open({ size, touch, init: INIT });
  const ev = (js) => page.evalJs(js, true);
  try {
    await page.navigate('debug=menu&uianim=0');
    await CDP.sleep(2500);
    await ev(PAGE);
    ok('página con VB.Account', await ev('!!(window.VB && VB.Account && VB.Account.open)'));
    ok('sin indicador viejo no se carga el SDK al arrancar', (await ev('__G.loads')) === 0);
    // 1) SDK lento: el clic llega antes de que acabe la precarga → la ventana se abre tarde → bloqueada → confirmación
    await ev("__G.delay = 1500; __G.modes = ['blocked']; VB.Account.open(); true");
    ok('el panel precarga el SDK al abrirse', (await ev('__G.loads')) >= 1);
    ok('«Entrar con Google» pulsado', await ev("__click('[data-ac=google]')"));
    ok('sale la confirmación', await ev("__until(function(){ return VB.Account._view() === 'gconfirm' && !!document.querySelector('#account [data-ac=gOpen]'); }, 4000)"));
    ok('el 1r intento fue fuera del clic (SDK aún cargando)', (await ev('JSON.stringify(__G.inClick)')) === '[false]', await ev('JSON.stringify(__G.inClick)'));
    const txt = await ev("document.querySelector('#account .ac-gc').innerText");
    ok('texto de la confirmación', /se abrirá una ventana de Google/i.test(txt) && /Abrir Google/i.test(txt) && /Cancelar/i.test(txt), txt.replace(/\s+/g, ' ').slice(0, 120));
    const bo = await ev("JSON.stringify(__box('[data-ac=gOpen]'))"), bc = await ev("JSON.stringify(__box('[data-ac=gNo]'))");
    const o = JSON.parse(bo), c = JSON.parse(bc);
    ok('«Abrir Google» ≥ 44 px, letra ≥ 12 y dentro de la pantalla', o.h >= 44 && o.w >= 44 && o.fs >= 12 && o.in, bo);
    ok('«Cancelar» ≥ 44 px y dentro de la pantalla', c.h >= 44 && c.w >= 44 && c.in, bc);
    const small = await ev("Array.from(document.querySelectorAll('#account .ac-gc *')).filter(function(e){ return e.childNodes.length && Array.from(e.childNodes).some(function(n){return n.nodeType===3&&n.textContent.trim();}) && e.getBoundingClientRect().width>0 && parseFloat(getComputedStyle(e).fontSize) < 12; }).length");
    ok('ninguna letra < 12 px en la confirmación', small === 0, 'pequeñas: ' + small);
    if (process.env.SHOT) { await CDP.sleep(200); console.log('  captura', await page.shot(path.resolve(process.env.SHOT, 'google-confirm-' + size + '.png'))); }
    // 2) «Abrir Google» → signInWithPopup dentro del clic; vuelve a bloquearse → aviso
    await ev("__G.modes = ['blocked']; true");
    ok('«Abrir Google» pulsado', await ev("__click('[data-ac=gOpen]')"));
    ok('2º intento dentro del clic (síncrono)', (await ev('JSON.stringify(__G.inClick)')) === '[false,true]', await ev('JSON.stringify(__G.inClick)'));
    ok('bloqueada otra vez: sigue la confirmación con el aviso', await ev("__until(function(){ var e = document.querySelector('#account .ac-err'); return VB.Account._view() === 'gconfirm' && e && /bloqueado la ventana de Google. Permite las ventanas emergentes/.test(e.textContent); }, 3000)"));
    if (process.env.SHOT) { await CDP.sleep(200); console.log('  captura', await page.shot(path.resolve(process.env.SHOT, 'google-bloqueada-' + size + '.png'))); }
    // «Abrir Google» y la persona cierra la ventana → vuelve a entrar, sin mensaje
    await ev("__G.modes = ['cancel']; true");
    await ev("__click('[data-ac=gOpen]')");
    ok('3r intento dentro del clic', (await ev('__G.inClick[2]')) === true);
    ok('ventana cerrada: vuelve a la vista de entrar sin mensaje', await ev("__until(function(){ return VB.Account._view() === 'enter' && !!document.querySelector('#account [data-ac=google]') && !document.querySelector('#account .ac-err').textContent; }, 3000)"));
    // 4) SDK ya cargado: el 1r toque abre la ventana en el acto; bloqueada → confirmación; «Cancelar» vuelve
    ok('SDK precargado', await ev('VB.Account._sdkReady()'));
    await ev("__G.modes = ['blocked']; true");
    await ev("__click('[data-ac=google]')");
    ok('con el SDK cargado, el 1r toque llama a signInWithPopup dentro del clic', (await ev('__G.inClick[3]')) === true, await ev('JSON.stringify(__G.inClick)'));
    ok('confirmación otra vez', await ev("__until(function(){ return VB.Account._view() === 'gconfirm'; }, 3000)"));
    ok('«Cancelar» pulsado', await ev("__click('[data-ac=gNo]')"));
    ok('«Cancelar» vuelve a entrar con el formulario', await ev("VB.Account._view() === 'enter' && !!document.querySelector('#account #acUser') && __G.popup === 4"));
    ok('Escape cierra el panel desde la confirmación', await ev("(function(){ __G.modes=['blocked']; __click('[data-ac=google]'); return __until(function(){ return VB.Account._view()==='gconfirm'; },3000).then(function(){ document.querySelector('#account').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return !VB.Account.isOpen(); }); })()"));
    // 5) nunca redirección
    ok('nunca signInWithRedirect ni getRedirectResult', (await ev('__G.redirect + __G.grr')) === 0, 'redirect ' + (await ev('__G.redirect')) + ', getRedirectResult ' + (await ev('__G.grr')));
    // indicador de redirección de versiones anteriores: se limpia sin cargar el SDK
    await ev("sessionStorage.setItem('make-the-cut.account.gredir','1'); true");
    await page.navigate('debug=menu&uianim=0'); await CDP.sleep(2500);
    ok('indicador gredir borrado al cargar', (await ev("sessionStorage.getItem('make-the-cut.account.gredir')")) === null);
    ok('y sin cargar el SDK ni getRedirectResult', (await ev('__G.loads + __G.grr')) === 0);
    // 6) Google responde bien: tras el toque se entra (gFinish → begin), el SDK se cierra con signOut y se sube lo local
    await ev(PAGE);
    await ev("localStorage.removeItem('make-the-cut.account'); if (localStorage.getItem('make-the-cut.record') == null) localStorage.setItem('make-the-cut.record', '{}'); __G.delay = 40; __G.remote = []; VB.Account.open(); true");
    ok('SDK precargado (para entrar)', await ev("__until(function(){ return VB.Account._sdkReady(); }, 3000)"));
    await ev("__G.modes = ['ok']; true");
    ok('«Entrar con Google» pulsado (Google responde bien)', await ev("__click('[data-ac=google]')"));
    ok('signInWithPopup dentro del clic', (await ev('__G.inClick[__G.inClick.length - 1]')) === true);
    ok('se entra: vista de la cuenta', await ev("__until(function(){ return VB.Account._view() === 'in' && !!document.querySelector('#account [data-ac=out]'); }, 4000)"), await ev('VB.Account._view()'));
    ok('sesión de Google guardada', await ev("(function(){ var n = VB.Account.netInfo && VB.Account.netInfo(); return !!n && n.uid === 'gtest-uid' && n.kind === 'google'; })()"), await ev('JSON.stringify(VB.Account.netInfo && VB.Account.netInfo())'));
    ok('el SDK se cierra (window.firebase.auth().signOut) una vez', (await ev('__G.signOut')) === 1, 'signOut ' + (await ev('__G.signOut')));
    ok('se lee la nube y se sube lo local', await ev("__until(function(){ return __G.net[0] === 'GET' && __G.patch > 0; }, 3000)"), await ev("JSON.stringify(__G.net.slice(0, 6)) + ' patch ' + __G.patch"));
    ok('«Cerrar sesión» vuelve a entrar', await ev("__click('[data-ac=out]') && VB.Account._view() === 'enter' && !VB.Account.netInfo()"));
    // 7) Google responde bien pero la Carrera de la cuenta y la del dispositivo son distintas: conflicto de progreso
    await ev("localStorage.setItem('make-the-cut.career', JSON.stringify({ gtest: 'local' })); __G.remote = [{ name: 'career', data: JSON.stringify({ gtest: 'nube' }), at: Date.now() - 5000 }]; __G.modes = ['ok']; true");
    ok('«Entrar con Google» pulsado (Carreras distintas)', await ev("__click('[data-ac=google]')"));
    ok('sale el conflicto de Carreras', await ev("__until(function(){ return VB.Account._view() === 'conflict' && !!document.querySelector('#account [data-ac=keepRemote]') && !!document.querySelector('#account [data-ac=keepLocal]'); }, 4000)"), await ev('VB.Account._view()'));
    ok('nunca signInWithRedirect ni getRedirectResult (al entrar)', (await ev('__G.redirect + __G.grr')) === 0);
    await ev("localStorage.removeItem('make-the-cut.account'); true");
    const errs = page.errors.filter(e => !/favicon/.test(e));
    ok('sin errores JS en la página', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) { ok('excepción: ' + (e && e.message || e), false); }
  page.close();
}

(async () => {
  await run('844x390', true);
  await run('1280x720', false);
  console.log(fails ? fails + ' FALLOS, ' + oks + ' ok' : 'TODO OK (' + oks + ')');
  process.exit(fails ? 1 : 0);
})();
