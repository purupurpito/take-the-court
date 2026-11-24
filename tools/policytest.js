#!/usr/bin/env node
/* TAKE THE COURT — tools/policytest.js (owner: ui_main, Google Play, 24-nov-2026)
 * Pruebas de las páginas legales (pages/privacidad.html y pages/borrar-cuenta.html; notes/playstore/privacidad.md):
 *  1) SIN navegador: las dos existen, <html lang="es">, secciones #es (lang es) y #en (lang en), <title> corto, sin scripts ni hojas
 *     externas, sin «1.er», sin más correo que help@takethecourt.com, sin menciones a herramientas de IA, y la política
 *     cuenta lo que el código hace (informe de red, IP al rival, STUN, eur3, 14 años, AEPD, fecha 24-nov-2026…). La lista de documentos de
 *     borrar-cuenta.html es la misma DOCS de js/account.js. build-pages: copia las dos a _site; STRICT_POLICY=1 falla con huecos o si
 *     falta una y pasa con las páginas rellenas; sin STRICT_POLICY, una copia sin las páginas también pasa (las de abouttest).
 *  2) CON navegador (tools/cdp.js; NOCDP=1 la salta), sobre el _site recién generado (file://):
 *     a) las dos páginas a 360×640 (vertical) y 568×320 (horizontal): sin errores de JS, sin desplazamiento horizontal, enlaces internos
 *        que existen (archivo y ancla);
 *     b) borrar-cuenta.html sin sesión: instrucciones, sin botón y sin ninguna petición de red;
 *     c) con una sesión falsa y fetch de pega: el botón sigue apagado hasta escribir BORRAR (con «BORRA» no hace nada); al borrar, las
 *        llamadas son LAS MISMAS (método, dirección y token) que deleteAccount() de js/account.js en vm con el mismo Firestore de pega,
 *        con token vigente y con token caducado (renueva por securetoken); después no queda sesión y está 'make-the-cut.account.out';
 *     d) casos que NO deben borrar la cuenta (mismas llamadas que account.js y la sesión sigue para reintentar): token con auth_time de
 *        hace más de 5 min (ninguna llamada), Firebase responde CREDENTIAL_TOO_OLD_LOGIN_AGAIN, un DELETE da 503, la lista da 503;
 *        y con sala propia (GET rooms/u1 existe): borra sig/offer, sig/answer y la sala antes de accounts:delete;
 *     e) el juego: Ajustes › Info tiene «Privacidad» tras «Créditos» y abre privacidad.html en otra pestaña (en local, la de
 *        takethecourt.com; con window.__vbBuild, la de al lado).
 * Uso: node tools/policytest.js     Sale con 1 si falla algo.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), cp = require('child_process'), url = require('url');
const ROOT = path.join(__dirname, '..');
let fails = 0, oks = 0;
const check = (c, m, extra) => { if (c) { oks++; console.log('  ok   ' + m); } else { fails++; console.log('  FALLO ' + m + (extra !== undefined ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PAGES = ['privacidad.html', 'borrar-cuenta.html'];
const rd = f => fs.readFileSync(path.join(ROOT, 'pages', f), 'utf8');

// ---------------------------------------------------------------- 1) sin navegador
console.log('1) contenido');
const SRC = {};
for (const f of PAGES) {
  const ok0 = check(fs.existsSync(path.join(ROOT, 'pages', f)), f + ': existe');
  if (!ok0) continue;
  const s = SRC[f] = rd(f);
  const title = (/<title>([^<]*)<\/title>/.exec(s) || [])[1] || '';
  check(/^<!doctype html>\s*<html lang="es">/i.test(s), f + ': doctype y <html lang="es">');
  check(/<meta name="viewport" content="width=device-width,initial-scale=1">/.test(s), f + ': viewport de móvil');
  check(title && title.length <= 40, f + ': <title> corto («' + title + '»)');
  check(/<article class="doc" id="es" lang="es">/.test(s) && /<article class="doc" id="en" lang="en">/.test(s), f + ': secciones #es (lang es) y #en (lang en)');
  check(!/<script[^>]+src=|<link[^>]+rel="stylesheet"|@import|fonts\.googleapis/i.test(s), f + ': sin scripts, hojas ni fuentes externas');
  check(!/1\.er|2\.º|3\.er/.test(s), f + ': sin ordinales con punto');
  check(!/claude|anthropic|chatgpt|\bIA\b|inteligencia artificial|\bAI\b/i.test(s), f + ': sin menciones a herramientas de IA');
  const mails = (s.split('help@takethecourt.com').join('').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []);
  check(!mails.length, f + ': ningún correo escrito salvo help@takethecourt.com', mails);
  check(!/purupurpito|gmail/i.test(s), f + ': sin el usuario ni el correo personal del dueño');
  check(/help@takethecourt.com/.test(s) && !/{{[A-Z_0-9]+}}/.test(s), f + ': contacto help@takethecourt.com y sin huecos {{...}}');
  check(/href="\.\/"/.test(s), f + ': enlace de vuelta al juego');
}
if (SRC['privacidad.html']) {
  const s = SRC['privacidad.html'];
  const es = s.slice(s.indexOf('id="es"'), s.indexOf('id="en"')), en = s.slice(s.indexOf('id="en"'));
  const need = [
    ['responsable y contacto', /\{\{RESPONSABLE\}\}|\bresponsable de tus datos es <b>[^<{]+<\/b>/, /controller of your data is <b>/],
    ['fecha en vigor 24-nov-2026', /24 de noviembre de 2026/, /24 November 2026/],
    ['cuenta opcional', /cuenta es opcional/, /account is optional/],
    ['informe de red (netlog) y que no se puede desactivar', /Informe de red[\s\S]*no se puede desactivar/, /Network report[\s\S]*cannot be turned off/],
    // (24-nov-2026) netlogs con exp = +90 días y política TTL (notes/net.md «Caducidad de los informes»): la página dice 90 días y
    // que borrar la cuenta no los adelanta; el código y las reglas se comprueban abajo
    ['los informes de red caducan a los 90 días y la cuenta no los adelanta', /Informes de red:<\/b> 90 días[\s\S]*no se borran antes de tiempo/, /Network reports:<\/b> 90 days[\s\S]*does not delete them earlier/],
    ['el informe de red se borra solo a los 90 días', /Se borra solo a los 90 días/, /deleted automatically after 90 days/],
    ['IP al rival y STUN', /dirección IP[\s\S]*STUN|STUN[\s\S]*dirección IP/, /IP address[\s\S]*STUN|STUN[\s\S]*IP address/],
    ['nombre visible por defecto anónimo («Jugador» y un número, no el de la cuenta ni el del personaje)', /Si no escribes uno, sales como «Jugador» y un número[\s\S]*no se usa el nombre de tu cuenta ni el de tu personaje/, /you appear as "Jugador" plus a number[\s\S]*your account name and your character's name are not used/],
    ['filtro básico de palabras en los nombres', /filtro básico de palabras/, /basic word filter/],
    ['Firestore en la UE (eur3)', /eur3/, /eur3/],
    ['proveedores: GitHub y Cloudflare', /GitHub Pages[\s\S]*Cloudflare/, /GitHub Pages[\s\S]*Cloudflare/],
    ['copia de los archivos para jugar sin conexión', /copia de los archivos del juego para poder jugar sin conexión/, /copy of the game files so you can play offline/],
    ['transferencias (Marco de Privacidad / cláusulas tipo)', /Marco de Privacidad de Datos UE-EE\. UU\./, /Data Privacy Framework/],
    ['derechos y AEPD', /portabilidad[\s\S]*aepd\.es/, /portability[\s\S]*aepd\.es/],
    ['edad mínima 14 años', /mayores de 14 años/, /aged 14 or over/],
    ['identificador aleatorio del dispositivo en el perfil', /identificador aleatorio de cada dispositivo/, /random identifier for each device/],
    ['sesión sin cifrar en el dispositivo', /sin cifrar/, /unencrypted/],
    ['sin anuncios, analítica ni compras', /No hay anuncios, ni analítica/, /no ads, analytics/i],
    ['enlace a la página de borrar la cuenta', /href="borrar-cuenta\.html"/, /href="borrar-cuenta\.html#en"/]
  ];
  for (const [n, rEs, rEn] of need) check(rEs.test(es) && rEn.test(en), 'privacidad: ' + n + ' (es y en)');
  // three.js y las fuentes van en vendor/ desde el 24-nov-2026 (notes/offline.md): ni el juego ni la política hablan de cdnjs ni de
  // Google Fonts. Si un día el index vuelve a pedirlas, la política tiene que volver a nombrarlas (y esta prueba, a exigirlo).
  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const thirdIdx = /cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(idxSrc);
  check(!thirdIdx, 'index.html no pide nada a cdnjs ni a Google Fonts (three.js y fuentes en vendor/)');
  check(!/Google Fonts|cdnjs/.test(s), 'privacidad: no nombra Google Fonts ni cdnjs (ya no se usan)');
  check(!/\bTURN\b|turn\.takethecourt/.test(s), 'privacidad: no presenta como activo el TURN (apagado en netconfig.js)');
  const ncfg = fs.readFileSync(path.join(ROOT, 'js', 'netconfig.js'), 'utf8');
  check(/VB\.NET_TURN_URL\s*=\s*''/.test(ncfg), 'netconfig.js: el TURN sigue apagado (si se enciende, hay que cambiar «no usamos servidores de retransmisión»)');
  // lo que la página promete de los informes y del nombre, frente al código (el TTL lo activa el responsable: notes/net.md)
  const nlog = fs.readFileSync(path.join(ROOT, 'js', 'netlog.js'), 'utf8'), rules = fs.readFileSync(path.join(ROOT, 'firebase', 'firestore.rules'), 'utf8');
  check(/var KEEP_MS = 90 \* 86400000;/.test(nlog) && /f\.exp = \{ timestampValue: new Date\(now \+ KEEP_MS\)/.test(nlog), 'netlog.js: cada informe lleva exp = ahora + 90 días (lo que dice «90 días»)');
  check(/hasOnly\(\['uid', 'ver', 't', 'j', 'exp'\]\)/.test(rules) && /d\.exp is timestamp/.test(rules), 'firestore.rules: netlogs admite exp (timestamp)');
  const nlob = fs.readFileSync(path.join(ROOT, 'js', 'netlobby.js'), 'utf8');
  const defN = nlob.slice(nlob.indexOf('function defaultName()'), nlob.indexOf('function sanAttrs('));
  check(/anonName\(\)/.test(defN) && !/careerPlayer|netInfo/.test(defN) && fs.existsSync(path.join(ROOT, 'js', 'namefilter.js')), 'netlobby.js: nombre por defecto anónimo y filtro de palabras (js/namefilter.js)');
}
if (SRC['borrar-cuenta.html']) {
  const s = SRC['borrar-cuenta.html'];
  check(/«Cuenta»[\s\S]*«Borrar la cuenta»[\s\S]*«Sí, borrar la cuenta»/.test(s), 'borrar-cuenta: camino del juego con los nombres de los botones');
  const acc = fs.readFileSync(path.join(ROOT, 'js', 'account.js'), 'utf8');
  check(/data-ac="del">Borrar la cuenta</.test(acc) && /spb\('delYes', 'Sí, borrar la cuenta'/.test(acc) && /btn\.id = 'btnAcc'/.test(acc), 'account.js sigue teniendo «Borrar la cuenta» y «Sí, borrar la cuenta» (los nombres que cita la página)');
  check(/Qué se borra[\s\S]*Qué se queda/.test(s) && /What is deleted[\s\S]*What remains/.test(s), 'borrar-cuenta: qué se borra y qué se queda (es y en)');
  check(/Informes de red/.test(s) && /Network reports/.test(s), 'borrar-cuenta: habla de los informes de red');
  check(/se borran solos a los 90 días[\s\S]*no los borra antes/.test(s) && /deleted automatically 90 days after each match[\s\S]*does not delete them earlier/.test(s), 'borrar-cuenta: informes de red, 90 días y la cuenta no los adelanta (es y en)');
  check(/mailto:\{\{CONTACTO_EMAIL\}\}|mailto:[^"{]+@/.test(s), 'borrar-cuenta: borrado por correo');
  check(!/window\.confirm|\bconfirm\(|\balert\(|\bprompt\(/.test(s), 'borrar-cuenta: sin confirm/alert/prompt');
  const keyA = (/key: '([^']+)'/.exec(acc) || [])[1], keyP = (/var KEY = '([^']+)'/.exec(s) || [])[1];
  check(keyA && keyA === keyP, 'borrar-cuenta: misma clave de la API que account.js');
  check(/projects\/make-the-cut-vb\/databases\/\(default\)\/documents\//.test(s), 'borrar-cuenta: mismo proyecto de Firestore');
}

// ---------------------------------------------------------------- build-pages
console.log('1b) build-pages');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vbpolicy-'));
const runBuild = (root, out, env) => {
  const e = Object.assign({}, process.env, env || {}); if (!env || !('STRICT_POLICY' in env)) delete e.STRICT_POLICY;
  const r = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'build-pages.js'), out], { env: e, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const SITE = path.join(tmp, 'site');
{
  const r = runBuild(ROOT, SITE);
  check(r.code === 0, 'build-pages (sin STRICT_POLICY) sale con 0', r.out.trim());
  check(PAGES.every(f => fs.existsSync(path.join(SITE, f)) && fs.readFileSync(path.join(SITE, f), 'utf8') === rd(f)), '_site con privacidad.html y borrar-cuenta.html tal cual');
  const holes = PAGES.some(f => /\{\{[A-Z0-9_]+\}\}/.test(rd(f)));
  if (holes) {
    check(/aviso \(páginas legales\)/.test(r.out), 'sin STRICT_POLICY avisa de los huecos sin rellenar');
    const s = runBuild(ROOT, path.join(tmp, 'site-strict'), { STRICT_POLICY: '1' });
    check(s.code === 1 && /huecos sin rellenar/.test(s.out), 'STRICT_POLICY=1 falla con huecos sin rellenar', s.out.trim());
  } else {
    const s = runBuild(ROOT, path.join(tmp, 'site-strict'), { STRICT_POLICY: '1' });
    check(s.code === 0, 'huecos rellenos: STRICT_POLICY=1 pasa', s.out.trim());
  }
  // copia mínima del proyecto (como abouttest)
  const mini = (pages) => {
    const d = fs.mkdtempSync(path.join(tmp, 'mini-'));
    for (const x of ['tools', 'js', 'pages']) fs.mkdirSync(path.join(d, x));
    fs.copyFileSync(path.join(ROOT, 'tools', 'build-pages.js'), path.join(d, 'tools', 'build-pages.js'));
    fs.writeFileSync(path.join(d, 'js', 'version.js'), "VB.VERSION='1.2.3';VB.CHANGELOG=[{v:'1.2.3',d:'2026-01-01',t:'x',items:['x']}];");
    fs.copyFileSync(path.join(ROOT, 'pages', 'og.png'), path.join(d, 'pages', 'og.png'));
    fs.writeFileSync(path.join(d, 'index.html'), '<title>Take the Court</title>\n<meta name="theme-color" content="#070b14">\n<p>hola</p>\n');
    for (const [f, txt] of Object.entries(pages || {})) fs.writeFileSync(path.join(d, 'pages', f), txt);
    return d;
  };
  const fill = t => t.replace(/\{\{RESPONSABLE\}\}/g, 'Nombre de Prueba').replace(/\{\{CONTACTO_EMAIL\}\}/g, 'privacidad@example.org');
  let d = mini();
  check(runBuild(d, path.join(d, '_s')).code === 0, 'sin las páginas y sin STRICT_POLICY el build pasa (copias mínimas de abouttest)');
  check(runBuild(d, path.join(d, '_s'), { STRICT_POLICY: '1' }).code === 1, 'STRICT_POLICY=1 falla si faltan las páginas');
  d = mini({ 'privacidad.html': fill(rd('privacidad.html')) });
  check(runBuild(d, path.join(d, '_s'), { STRICT_POLICY: '1' }).code === 1, 'STRICT_POLICY=1 falla si falta borrar-cuenta.html');
  d = mini({ 'privacidad.html': fill(rd('privacidad.html')), 'borrar-cuenta.html': fill(rd('borrar-cuenta.html')) });
  const rf = runBuild(d, path.join(d, '_s'), { STRICT_POLICY: '1' });
  check(rf.code === 0 && fs.existsSync(path.join(d, '_s', 'privacidad.html')), 'STRICT_POLICY=1 pasa con las dos páginas rellenas', rf.out.trim());
}

// ---------------------------------------------------------------- deleteAccount de account.js en vm (referencia)
/** Firestore de pega común: lista {squad, career, zzz}; DELETE 200; securetoken renueva a tok2; accounts:delete 200 o mode 'old' → 400.
 *  mode 'room': rooms/u1 existe; 'fail': DELETE de saves/career da 503; 'listfail': la lista da 503. */
function fakeResp(u, m, mode) {
  const J = (status, j) => ({ status, j });
  if (mode === 'fail' && m === 'DELETE' && /\/saves\/career$/.test(u)) return J(503, { error: { message: 'UNAVAILABLE' } });
  if (mode === 'listfail' && m === 'GET' && /\/saves\?pageSize=50$/.test(u)) return J(503, { error: { message: 'UNAVAILABLE' } });
  if (mode === 'room' && m === 'GET' && /\/rooms\/u1$/.test(u)) return J(200, { name: 'projects/make-the-cut-vb/databases/(default)/documents/rooms/u1', fields: {} });
  if (/securetoken\.googleapis\.com/.test(u)) return J(200, { id_token: 'tok2', refresh_token: 'r2', expires_in: '3600' });
  if (/identitytoolkit\.googleapis\.com/.test(u)) return mode === 'old' ? J(400, { error: { message: 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN' } }) : J(200, { kind: 'identitytoolkit#DeleteAccountResponse' });
  if (m === 'GET' && /\/saves\?pageSize=50$/.test(u)) return J(200, { documents: ['squad', 'career', 'zzz'].map(n => ({ name: 'projects/make-the-cut-vb/databases/(default)/documents/users/u1/saves/' + n, fields: {} })) });
  if (m === 'DELETE') return J(200, {});
  return J(404, {});
}
const norm = c => c.method + ' ' + c.url.replace(/key=[^&]+/, 'key=K') + ' ' + (c.auth || '') + (c.body ? ' ' + c.body : '');
/** opts.gone: antes de llamar, otra pestaña (o borrar-cuenta.html) quita la sesión; se sube con _push en vez de borrar. */
async function vmDelete(session, mode, opts) {
  class Storage { constructor() { this._m = new Map(); } getItem(k) { return this._m.has(k) ? this._m.get(k) : null; } setItem(k, v) { this._m.set(k, String(v)); } removeItem(k) { this._m.delete(k); } }
  const LS = new Storage(), SS = new Storage(); LS._m.set('make-the-cut.account', JSON.stringify(session));
  const calls = [];
  async function fetch(u, opt) {
    opt = opt || {}; const m = opt.method || 'GET', h = opt.headers || {};
    const body = /identitytoolkit/.test(u) ? opt.body : null;
    calls.push({ method: m, url: u, auth: h.Authorization || '', body });
    const r = fakeResp(u, m, mode);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.j };
  }
  const el = () => ({ setAttribute() { }, appendChild() { }, addEventListener() { }, querySelector() { return null; }, querySelectorAll() { return []; }, style: {}, hidden: true, classList: { add() { }, remove() { }, toggle() { } } });
  const document = { readyState: 'loading', visibilityState: 'visible', addEventListener() { }, getElementById() { return null; }, createElement: el, body: el(), head: el() };
  const ctx = { console, Math, Date, JSON, Object, Array, Promise, atob, setTimeout, clearTimeout, setInterval() { }, AbortController, Storage, localStorage: LS, sessionStorage: SS, document, fetch, location: { reload() { }, hostname: 'takethecourt.com', search: '', hash: '' }, addEventListener() { } };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx); ctx.VB = { ctx: { state: 'menu' } };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'account.js'), 'utf8'), ctx, { filename: 'js/account.js' });
  let err = null;
  if (opts && opts.gone) { LS.setItem('make-the-cut.squad', '{"a":[]}'); LS._m.delete('make-the-cut.account'); try { await ctx.VB.Account._push(); } catch (e) { err = e.code || e.message; } }
  else try { await ctx.VB.Account._delete(); } catch (e) { err = e.code || e.message; }
  return { calls: calls.map(norm).sort(), err, ses: LS.getItem('make-the-cut.account'), out: LS.getItem('make-the-cut.account.out') };
}

// ---------------------------------------------------------------- 2) con navegador
async function browser() {
  const CDP = require('./cdp.js');
  const fileUrl = (f, q) => url.pathToFileURL(path.join(SITE, f)).href + (q || '');
  // fetch de pega (solo en borrar-cuenta.html): registra las llamadas y contesta como fakeResp; el modo va en sessionStorage
  const STUB = `(function(){ if (!/borrar-cuenta\\.html$/.test(location.pathname)) return;
    var fake = ${fakeResp.toString()};
    window.__calls = [];
    window.fetch = function (u, opt) { opt = opt || {}; var m = opt.method || 'GET', h = opt.headers || {};
      window.__calls.push({ method: m, url: String(u), auth: h.Authorization || '', body: /identitytoolkit/.test(u) ? opt.body : null });
      var r = fake(String(u), m, sessionStorage.getItem('pt.mode') || 'ok');
      return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: function () { return Promise.resolve(r.j); } }); };
  })();`;
  let pg;
  const nav = async (u) => { const p = new Promise(r => { const off = () => { }; pg.on('Page.loadEventFired', () => r()); }); await pg.send('Page.navigate', { url: u }); await Promise.race([p, sleep(8000)]); await sleep(250); };
  try {
    pg = await CDP.open({ size: '360x640', touch: true, init: [STUB] });
    const E = s => pg.evalJs(s), JE = async s => JSON.parse(await E('JSON.stringify(' + s + ')'));
    // a) maquetación, errores y enlaces
    console.log('2a) páginas a 360×640 y 568×320');
    for (const size of ['360x640', '568x320']) {
      await pg.setSize(size, true);
      for (const f of PAGES) {
        const e0 = pg.errors.length;
        await E(`try{localStorage.removeItem('make-the-cut.account')}catch(e){};1`).catch(() => { });
        await nav(fileUrl(f));
        const m = await JE(`{sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth,
          es: !!document.querySelector('#es[lang=es]'), en: !!document.querySelector('#en[lang=en]'),
          wide: [].slice.call(document.querySelectorAll('body *')).filter(function(x){var r=x.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<-1);}).slice(0,4).map(function(x){return x.tagName+'.'+x.className+'#'+x.id;}),
          links: [].map.call(document.querySelectorAll('a[href]'), function(a){return a.getAttribute('href');})}`);
        check(pg.errors.length === e0, `${f} ${size}: sin errores de JS`, pg.errors.slice(e0));
        check(m.sw <= m.cw && m.bw <= m.cw && !m.wide.length, `${f} ${size}: sin desplazamiento horizontal (${m.sw}/${m.cw})`, m.wide);
        check(m.es && m.en, `${f} ${size}: secciones es y en`);
        if (size === '360x640') {
          const bad = [];
          for (const h of m.links) {
            if (/^(https?:|mailto:)/.test(h)) continue;
            const [p, hash] = h.split('#'); const target = p === '' ? f : p === './' ? 'index.html' : p;
            if (!fs.existsSync(path.join(SITE, target))) { bad.push(h); continue; }
            if (hash) { const txt = fs.readFileSync(path.join(SITE, target), 'utf8'); if (!new RegExp('id="' + hash + '"').test(txt)) bad.push(h); }
          }
          check(!bad.length, `${f}: ${m.links.length} enlaces internos que existen (archivo y ancla)`, bad);
        }
        if (process.env.KEEP === '1') await pg.shot(path.join(tmp, 'shots', f.replace('.html', '') + '-' + size + '.png'));
      }
    }
    await pg.setSize('360x640', true);
    // b) sin sesión
    console.log('2b) borrar-cuenta.html sin sesión');
    await nav(fileUrl('borrar-cuenta.html'));
    let st = await JE(`{none: !document.getElementById('dNone').hidden, ses: !document.getElementById('dSes').hidden, load: !document.getElementById('dLoad').hidden, calls: window.__calls.length, txt: document.getElementById('dNone').textContent}`);
    check(st.none && !st.ses && !st.load && /no hay ninguna sesión/.test(st.txt), 'sin sesión: instrucciones a la vista y sin el botón');
    check(st.calls === 0, 'sin sesión: ninguna petición de red');
    // c) con sesión, token vigente y caducado
    const typeIn = async (t) => { await E(`(function(){var i=document.getElementById('conf');i.value='';i.focus();return 1;})()`); await pg.send('Input.insertText', { text: t }); await sleep(120); };
    for (const [label, ses] of [['token vigente', { user: 'prueba@example.org', kind: 'mail', uid: 'u1', rt: 'r1', it: 'tok', ie: Date.now() + 3600e3 }],
      ['token caducado', { user: 'prueba', kind: 'user', uid: 'u1', rt: 'r1', it: 'old', ie: Date.now() - 1000 }]]) {
      console.log('2c) borrar con sesión (' + label + ')');
      const ref = await vmDelete(ses, 'ok');
      await E(`localStorage.setItem('make-the-cut.account', ${JSON.stringify(JSON.stringify(ses))}); localStorage.removeItem('make-the-cut.account.out'); sessionStorage.setItem('pt.mode','ok'); 1`);
      await nav(fileUrl('borrar-cuenta.html'));
      st = await JE(`{ses: !document.getElementById('dSes').hidden, who: document.getElementById('who').textContent, dis: document.getElementById('del').disabled}`);
      check(st.ses && st.who === ses.user && st.dis, label + ': «Has entrado como ' + ses.user + '» y el botón apagado');
      await E(`document.getElementById('del').click(), 1`); await sleep(200);
      check((await E('window.__calls.length')) === 0, label + ': pulsar sin escribir no hace nada');
      await typeIn('BORRA');
      st = await JE(`{dis: document.getElementById('del').disabled}`);
      await E(`document.getElementById('del').click(), 1`); await sleep(200);
      check(st.dis && (await E('window.__calls.length')) === 0, label + ': con «BORRA» sigue apagado y no hay peticiones');
      await typeIn('borrar');
      if (process.env.KEEP === '1') { await E("document.getElementById('web').scrollIntoView(), 1"); await pg.shot(path.join(tmp, 'shots', 'borrar-sesion.png')); }
      check(!(await E(`document.getElementById('del').disabled`)), label + ': con «borrar» se enciende');
      await E(`document.getElementById('del').click(), 1`);
      const t0 = Date.now(); while (Date.now() - t0 < 5000 && !(await E(`!document.getElementById('dDone').hidden`))) await sleep(100);
      const got = (await JE('window.__calls')).map(norm).sort();
      check(await E(`!document.getElementById('dDone').hidden`), label + ': «Cuenta borrada»');
      check(JSON.stringify(got) === JSON.stringify(ref.calls) && !ref.err, label + ': las mismas ' + got.length + ' llamadas que deleteAccount() de account.js',
        { pagina: got.filter(x => ref.calls.indexOf(x) < 0), juego: ref.calls.filter(x => got.indexOf(x) < 0) });
      check(got.some(x => /DELETE .*\/saves\/zzz /.test(x)) && got.some(x => /DELETE .*\/saves\/retos /.test(x)) && got.some(x => /accounts:delete/.test(x)),
        label + ': borra lo listado (zzz), las 11 claves (retos…) y la cuenta (accounts:delete)');
      const ls = await JE(`{s: localStorage.getItem('make-the-cut.account'), o: localStorage.getItem('make-the-cut.account.out')}`);
      check(ls.s === null && +ls.o > 0 && ref.ses === null && +ref.out > 0, label + ': sin sesión después y con make-the-cut.account.out (como signOut)');
    }
    // d) sesión antigua
    console.log('2d) CREDENTIAL_TOO_OLD_LOGIN_AGAIN');
    {
      const ses = { user: 'prueba', kind: 'user', uid: 'u1', rt: 'r1', it: 'tok', ie: Date.now() + 3600e3 };
      const ref = await vmDelete(ses, 'old');
      await E(`localStorage.setItem('make-the-cut.account', ${JSON.stringify(JSON.stringify(ses))}); sessionStorage.setItem('pt.mode','old'); 1`);
      await nav(fileUrl('borrar-cuenta.html'));
      await typeIn('BORRAR'); await E(`document.getElementById('del').click(), 1`);
      const t0 = Date.now(); while (Date.now() - t0 < 5000 && !(await E(`/vuelve a entrar/.test(document.getElementById('msg').textContent)`))) await sleep(100);
      st = await JE(`{msg: document.getElementById('msg').textContent, done: !document.getElementById('dDone').hidden, ses: !!localStorage.getItem('make-the-cut.account'), dis: document.getElementById('del').disabled}`);
      check(/cierra sesión en el juego, vuelve a entrar/.test(st.msg) && !st.done && st.ses && !st.dis, 'mensaje de volver a entrar, la sesión sigue y se puede reintentar', st);
      check(ref.err === 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN' && ref.ses !== null, 'account.js da el mismo error y tampoco cierra la sesión');
      check(JSON.stringify((await JE('window.__calls')).map(norm).sort()) === JSON.stringify(ref.calls), 'mismas llamadas que account.js también en este caso');
    }
    {
      const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
      const now = Math.floor(Date.now() / 1000);
      const jwt = at => b64({ alg: 'RS256' }) + '.' + b64({ auth_time: at, iat: now - 10, exp: now + 3590, user_id: 'u1' }) + '.sig';
      const cases = [
        ['entrada de hace 20 min (auth_time)', { user: 'prueba', kind: 'user', uid: 'u1', rt: 'r1', it: jwt(now - 1200), ie: Date.now() + 3600e3 }, 'ok', 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN', /vuelve a entrar/],
        ['un DELETE da 503', { user: 'prueba', kind: 'user', uid: 'u1', rt: 'r1', it: 'tok', ie: Date.now() + 3600e3 }, 'fail', 'partial', /No se ha podido borrar todo/],
        ['la lista da 503', { user: 'prueba', kind: 'user', uid: 'u1', rt: 'r1', it: 'tok', ie: Date.now() + 3600e3 }, 'listfail', 'unavailable', /No hay conexión/],
        ['entrada de hace 1 min y sala propia', { user: 'prueba', kind: 'user', uid: 'u1', rt: 'r1', it: jwt(now - 60), ie: Date.now() + 3600e3 }, 'room', null, null]
      ];
      for (const [label, ses, mode, code, re] of cases) {
        console.log('2d) ' + label);
        const ref = await vmDelete(ses, mode);
        await E(`localStorage.setItem('make-the-cut.account', ${JSON.stringify(JSON.stringify(ses))}); localStorage.removeItem('make-the-cut.account.out'); sessionStorage.setItem('pt.mode','${mode}'); 1`);
        await nav(fileUrl('borrar-cuenta.html'));
        await typeIn('BORRAR'); await E(`document.getElementById('del').click(), 1`);
        const t0 = Date.now(); while (Date.now() - t0 < 5000 && !(await E(`!document.getElementById('dDone').hidden || /\\S/.test(document.getElementById('msg').textContent.replace('Borrando…',''))`))) await sleep(100);
        st = await JE(`{msg: document.getElementById('msg').textContent, done: !document.getElementById('dDone').hidden, ses: !!localStorage.getItem('make-the-cut.account'), dis: document.getElementById('del').disabled}`);
        const got = (await JE('window.__calls')).map(norm).sort();
        check(JSON.stringify(got) === JSON.stringify(ref.calls), label + ': las mismas ' + got.length + ' llamadas que account.js', { pagina: got.filter(x => ref.calls.indexOf(x) < 0), juego: ref.calls.filter(x => got.indexOf(x) < 0) });
        if (code) {
          check(ref.err === code && ref.ses !== null, label + ': account.js da ' + code + ' y no cierra la sesión', ref.err);
          check(!got.some(x => /accounts:delete/.test(x)) && !st.done && st.ses && !st.dis && re.test(st.msg), label + ': no borra la cuenta, lo dice y deja reintentar', st);
          if (mode === 'ok' || mode === 'listfail') check(!got.some(x => /^DELETE /.test(x)), label + ': no borra ninguna partida');
        } else {
          check(!ref.err && st.done && !st.ses, label + ': cuenta borrada', st);
          const iDel = ['sig/offer', 'sig/answer', 'rooms/u1 '].map(k => got.some(x => x.indexOf('DELETE') === 0 && x.indexOf(k) > 0));
          check(iDel.every(Boolean) && got.some(x => /accounts:delete/.test(x)), label + ': borra sig/offer, sig/answer, la sala y la cuenta');
        }
      }
    }
    check(!pg.errors.length, 'páginas sin errores de JS en todo el recorrido', pg.errors);
    pg.close(); pg = null;

    // e) el juego
    console.log('2e) Ajustes › Info › Privacidad');
    pg = await CDP.open({ size: '1280x720' });
    const G = s => pg.evalJs(s);
    await pg.navigate('nonews=1&panel=set&tab=info');
    const t0 = Date.now(); while (Date.now() - t0 < 20000 && !(await G('!!(window.VB&&VB.ctx&&VB.ctx.state&&VB.UI)').catch(() => false))) await sleep(150);
    await sleep(1200);
    const rows = await G(`JSON.stringify([].map.call(document.querySelectorAll('.opt-g[data-tab="info"] [data-go]'), function(b){return b.getAttribute('data-go');}))`);
    check(JSON.parse(rows).join() === 'news,credits,priv,mig', 'Info: Novedades, Créditos, Privacidad, Traer tu partida', rows);
    const lbl = await G(`(document.querySelector('[data-go="priv"]')||{}).textContent||''`);
    check(/^Privacidad/.test(lbl.trim()), 'la fila dice «Privacidad»: ' + lbl.trim());
    await G(`window.__opened=[]; window.open=function(u,t,f){window.__opened.push([u,t,f]);return null;}; document.querySelector('[data-go="priv"]').click(); 1`);
    await sleep(300);
    let op = JSON.parse(await G('JSON.stringify(window.__opened)'));
    check(op.length === 1 && op[0][0] === 'https://takethecourt.com/privacidad.html' && op[0][1] === '_blank', 'en local abre https://takethecourt.com/privacidad.html en otra pestaña', op);
    const still = await G(`VB.UI && VB.UI.isPanelOpen && VB.UI.isPanelOpen()`);
    check(still, 'Ajustes sigue abierto detrás');
    await G(`window.__vbBuild={v:'x'}; window.__opened=[]; document.querySelector('[data-go="priv"]').click(); 1`); await sleep(300);
    op = JSON.parse(await G('JSON.stringify(window.__opened)'));
    check(op.length === 1 && op[0][0] === 'privacidad.html', 'en Pages (window.__vbBuild) abre privacidad.html, la de al lado', op);
    check(!pg.errors.length, 'el juego sin errores de JS', pg.errors);
  } finally { if (pg) pg.close(); }
}

(async () => {
  console.log('1c) account.js deja de subir si otra pestaña quita la sesión');
  {
    const r = await vmDelete({ user: 'prueba', kind: 'user', uid: 'u1', rt: 'r1', it: 'tok', ie: Date.now() + 3600e3 }, 'ok', { gone: true });
    check(!r.err && !r.calls.length, 'sin sesión en el almacenamiento: _push no hace ninguna llamada (no recrea partidas de una cuenta borrada)', r.calls);
    const src = fs.readFileSync(path.join(ROOT, 'js', 'account.js'), 'utf8');
    check(/addEventListener\('storage'/.test(src), 'account.js escucha el evento storage');
  }
  try {
    if (process.env.NOCDP === '1') console.log('2) NOCDP=1: sin navegador');
    else await browser();
  } catch (e) { fails++; console.log('  FALLO navegador: ' + (e && e.stack || e)); }
  if (process.env.KEEP === '1') console.log('capturas en ' + path.join(tmp, 'shots'));
  else try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  console.log((fails ? 'FALLOS: ' + fails : 'TODO OK') + ' (' + oks + ' ok)');
  process.exit(fails ? 1 : 0);
})();
