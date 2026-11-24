#!/usr/bin/env node
/* TAKE THE COURT — tools/offlinetest.js (owner: ui_main; Google Play, 24-nov-2026; notes/offline.md)
 * Prueba del juego SIN RED (service worker sw.js + js/sw-reg.js + vendor/) sobre el _site de verdad, servido por http://localhost
 * (el único sitio, con takethecourt.com, donde se registra el service worker). Chrome headless (tools/cdp.js), táctil a 568×320,
 * con TODO lo que no sea localhost bloqueado (--host-resolver-rules): si el juego necesitara otra web para arrancar, se vería.
 *  0) Sin navegador: build-pages en una carpeta temporal (versión A, la del repo) y en otra con una versión falsa más nueva (B,
 *     copia del repo con VB.VERSION subida); los dos sw.js con su lista (sin version.json, netlogs, sw.js ni otras webs) y caché
 *     'ttc-<versión>-<hash>' distinta; el index sin cdnjs/Google Fonts; .well-known y .nojekyll copiados; el puente (bridge/) sin
 *     service worker; js/sw-reg.js solo registra en takethecourt.com y localhost.
 *  1) Primera visita con red (A): el service worker se instala y guarda la lista entera; la segunda carga ya va controlada.
 *  2) Sin red (servidor apagado + Network.emulateNetworkConditions offline): recarga → arranca en el menú; Ajustes se abre; «¡Jugar
 *     ya!» empieza un partido que corre unos segundos; una Carrera nueva empieza su partido; privacidad.html abre; version.json
 *     y una petición a Firestore fallan (no salen de la caché); sin errores de JS.
 *  3) Publicación (B en el servidor, con red): durante un partido no sale «Hay una versión nueva»; en el menú sí; «Reiniciar» →
 *     arranca la B (VB.VERSION nueva), la caché vieja se ha borrado, sin bucles de recarga; version.json y otra web (otro puerto)
 *     nunca salen del service worker ni se guardan.
 *  4) Sin red otra vez: arranca la B.
 * Uso: node tools/offlinetest.js     (sale con 1 si algo falla; KEEP=1 deja las carpetas temporales)
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), cp = require('child_process');
const CDP = require('./cdp.js');
const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (c, m, extra) => { if (c) { oks++; console.log('  ok   ' + m); } else { fails++; console.log('  FALLO ' + m + (extra !== undefined ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 420e3).unref();

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ttc-offline-'));
const SITE_A = path.join(TMP, 'siteA'), SITE_B = path.join(TMP, 'siteB'), SRC_B = path.join(TMP, 'srcB');
const VER_A = (/VB\.VERSION = '([\d.]+)'/.exec(fs.readFileSync(path.join(ROOT, 'js', 'version.js'), 'utf8')) || [])[1];
const VER_B = VER_A ? VER_A.split('.').map((n, i) => i === 1 ? +n + 77 : i === 2 ? 0 : n).join('.') : '9.9.0';

function build(root, out) {
  const r = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'build-pages.js'), out], { cwd: root, encoding: 'utf8', env: Object.assign({}, process.env, { PAGES_CNAME: '', STRICT_POLICY: '' }) });
  if (r.status !== 0) throw new Error('build-pages falla en ' + root + ': ' + (r.stderr || r.stdout));
  return r.stdout;
}
function swCfg(site) { const s = fs.readFileSync(path.join(site, 'sw.js'), 'utf8'); const m = /var VB_SW = (\{.*?\});\n/.exec(s); return m ? JSON.parse(m[1]) : null; }

// ---------------------------------------------------------------- servidor estático (como GitHub Pages: max-age=600)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
function serve(getRoot, port, extraHeaders) {
  const log = [], socks = new Set();
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
    log.push(u.pathname + u.search);
    const f = path.join(getRoot(), p);
    if (!f.startsWith(getRoot()) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404'); return; }
    res.writeHead(200, Object.assign({ 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'max-age=600' }, extraHeaders || {}));
    res.end(fs.readFileSync(f));
  });
  srv.on('connection', s => { socks.add(s); s.on('close', () => socks.delete(s)); });
  return new Promise(r => srv.listen(port, 'localhost', () => r({ srv, log, port: srv.address().port,
    stop: () => new Promise(k => { srv.close(() => k()); for (const s of socks) s.destroy(); }) })));
}

async function waitFor(pg, expr, ms) { const t = Date.now() + ms; while (Date.now() < t) { try { if (await pg.evalJs(expr, true)) return true; } catch (e) { } await sleep(200); } return false; }
const READY = "VB.ctx&&VB.ctx.state==='menu'&&VB.ctx.frame>5&&VB.UI&&VB.UI.bootBusy&&!VB.UI.bootBusy()";

(async () => {
  let pg = null, S = null, X = null, root = SITE_A;
  try {
    // ================================================================ 0) builds y comprobaciones sin navegador
    console.log('0) builds A (' + VER_A + ') y B (' + VER_B + ', falsa)');
    build(ROOT, SITE_A);
    fs.mkdirSync(SRC_B, { recursive: true });
    for (const d of ['index.html', 'sw.js', 'js', 'pages', 'vendor', 'tools/build-pages.js', 'bridge/version.json'])
      fs.cpSync(path.join(ROOT, d), path.join(SRC_B, d), { recursive: true });
    const vf = path.join(SRC_B, 'js', 'version.js');
    let vs = fs.readFileSync(vf, 'utf8').replace("VB.VERSION = '" + VER_A + "'", "VB.VERSION = '" + VER_B + "'").replace("v: '" + VER_A + "'", "v: '" + VER_B + "'");
    fs.writeFileSync(vf, vs);
    fs.writeFileSync(path.join(SRC_B, 'bridge', 'version.json'), JSON.stringify({ v: VER_B }));
    build(SRC_B, SITE_B);
    const A = swCfg(SITE_A), B = swCfg(SITE_B);
    check(A && B && A.v === VER_A && B.v === VER_B, 'sw.js con su versión (A ' + (A && A.cache) + ', B ' + (B && B.cache) + ')');
    check(A && B && A.cache !== B.cache && /^ttc-/.test(A.cache), 'cada publicación estrena caché');
    const bad = A ? A.files.filter(f => /version\.json|netlogs|sw\.js|^https?:|\.well-known|CNAME/.test(f.u)) : [1];
    check(!bad.length, 'la lista no lleva version.json, netlogs, sw.js, .well-known ni otras webs', bad);
    const need = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'privacidad.html', 'borrar-cuenta.html'];
    check(A && need.every(n => A.files.some(f => f.u === n)) && A.files.some(f => /^vendor\/three\/three\.min\.js\?v=/.test(f.u)) &&
      A.files.filter(f => /\.woff2$/.test(f.u)).length >= 20 && A.files.filter(f => /^js\/.*\?v=/.test(f.u)).length >= 60, 'la lista lleva index, js, three.js, fuentes, iconos, manifest y páginas legales (' + (A && A.files.length) + ' archivos)');
    const idx = fs.readFileSync(path.join(SITE_A, 'index.html'), 'utf8');
    check(!/cdnjs\.cloudflare|fonts\.googleapis|fonts\.gstatic/.test(idx), 'el index publicado no pide nada a cdnjs ni a Google Fonts');
    check(/<script src="js\/sw-reg\.js\?v=/.test(idx), 'el index publicado carga js/sw-reg.js');
    check(fs.existsSync(path.join(SITE_A, '.nojekyll')), '_site lleva .nojekyll (Pages sirve las carpetas con punto)');
    if (fs.existsSync(path.join(ROOT, 'pages', '.well-known'))) check(fs.readdirSync(path.join(ROOT, 'pages', '.well-known')).every(f => fs.existsSync(path.join(SITE_A, '.well-known', f))), 'pages/.well-known se copia a _site/.well-known');
    const brg = fs.readdirSync(path.join(ROOT, 'bridge')).map(f => fs.readFileSync(path.join(ROOT, 'bridge', f), 'utf8')).join('\n');
    check(!fs.existsSync(path.join(ROOT, 'bridge', 'sw.js')) && !/serviceWorker|sw-reg/.test(brg), 'el puente (bridge/) no tiene service worker ni lo registra');
    const reg = fs.readFileSync(path.join(ROOT, 'js', 'sw-reg.js'), 'utf8');
    check(/host === 'takethecourt\.com'/.test(reg) && /'localhost'/.test(reg) && !/github\.io/.test(reg.replace(/\/\*[\s\S]*?\*\//g, '')), 'sw-reg.js solo registra en takethecourt.com y localhost');
    const swt = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    check(!/skipWaiting\(\)[^;]*;\s*\}\);\s*$/m.test(swt.split("addEventListener('install'")[1].split("addEventListener('activate'")[0]) && /type === 'skipWaiting'/.test(swt), 'sw.js no salta la espera al instalar (solo con el mensaje de «Reiniciar»)');

    // ================================================================ servidores
    S = await serve(() => root, 0);
    X = await serve(() => SITE_A, 0, { 'access-control-allow-origin': '*' });   // «otra web» (otro puerto = otro origen)
    const BASE = 'http://localhost:' + S.port + '/', OTHER = 'http://localhost:' + X.port + '/version.json';
    pg = await CDP.open({ size: '568x320', touch: true, flags: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
    const net = [];   // respuestas: {url, sw (fromServiceWorker), status}
    const failed = [];
    pg.on('Network.responseReceived', p => net.push({ url: p.response.url, sw: !!p.response.fromServiceWorker, st: p.response.status }));
    pg.on('Network.loadingFailed', p => failed.push(p.errorText));
    const reqUrl = {}; pg.on('Network.requestWillBeSent', p => { reqUrl[p.requestId] = p.request.url; });
    const extFail = [];
    pg.on('Network.loadingFailed', p => { const u = reqUrl[p.requestId] || ''; if (u && !/^http:\/\/localhost/.test(u) && !/^data:|^blob:/.test(u)) extFail.push(u); });
    await pg.send('Network.enable');
    let navs = 0; pg.on('Page.frameNavigated', p => { if (!p.frame.parentId) navs++; });
    const go = async u => { await pg.send('Page.navigate', { url: u }); };
    const offline = on => pg.send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

    // ================================================================ 1) primera visita con red
    console.log('1) primera visita con red');
    await go(BASE);
    check(await waitFor(pg, READY, 40000), 'arranca en el menú (con red, versión ' + VER_A + ')');
    check(await waitFor(pg, "navigator.serviceWorker.getRegistration().then(function(r){return !!(r&&r.active&&r.active.state==='activated')})", 30000), 'el service worker se instala y se activa');
    const c1 = await pg.evalJs("caches.keys().then(function(k){return Promise.all(k.map(function(n){return caches.open(n).then(function(c){return c.keys()}).then(function(r){return {n:n,u:r.map(function(x){return x.url})}})}))}).then(JSON.stringify)", true).then(JSON.parse);
    check(c1.length === 1 && c1[0].n === A.cache && c1[0].u.length === A.files.length, 'caché ' + A.cache + ' con los ' + A.files.length + ' archivos', c1.map(c => c.n + ':' + c.u.length));
    check(c1.every(c => c.u.every(u => u.startsWith(BASE) && !/version\.json|netlogs|googleapis|sw\.js/.test(u))), 'en la caché solo hay archivos del juego (ni version.json ni otras webs)');
    check(!extFail.length, 'con todo lo que no es localhost bloqueado, el juego no pide nada fuera al arrancar', extFail.slice(0, 5));
    await go(BASE);
    check(await waitFor(pg, READY, 40000), 'segunda carga con red');
    check(await pg.evalJs('!!navigator.serviceWorker.controller'), 'la segunda carga ya va controlada por el service worker');
    check(await pg.evalJs("VB.SW&&VB.SW.on===true"), 'VB.SW.on en localhost');
    const e1 = pg.errors.length;

    // ================================================================ 2) sin red
    console.log('2) sin red');
    await S.stop(); await offline(true);
    const nLog = S.log.length;
    await go(BASE + '?x=1');
    check(await waitFor(pg, READY, 40000), 'SIN RED: arranca en el menú');
    check(await pg.evalJs('VB.VERSION') === VER_A && await pg.evalJs('typeof THREE==="object"&&THREE.REVISION') === '149', 'SIN RED: versión ' + VER_A + ' y three.js r149');
    const fonts = await pg.evalJs('window.__vbFontFaces');
    check(fonts >= 7, 'SIN RED: fuentes del juego cargadas (' + fonts + ' caras)');
    await pg.evalJs("document.getElementById('btnSettings').click()"); await sleep(800);
    check(await waitFor(pg, "(function(){var p=document.getElementById('panel');return !!p&&!p.hidden&&p.getBoundingClientRect().width>0&&/Ajustes/i.test(p.textContent)})()", 5000), 'SIN RED: Ajustes se abre');
    await pg.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await pg.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(600);
    const hasNow = await pg.evalJs("(function(){var b=document.getElementById('btnNow');return !!b&&!b.hidden})()");
    if (hasNow) await pg.evalJs("document.getElementById('btnNow').click()");
    else await pg.evalJs("VB.ctx.actions.startMatch({format:'2v2',sets:1,points:15})");
    check(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo", 15000), 'SIN RED: empieza un partido rápido');
    const f0 = await pg.evalJs('VB.ctx.frame'); await pg.evalJs('VB.ctx.introSkipReq=true'); await sleep(6000);
    const f1 = await pg.evalJs('VB.ctx.frame'), st = await pg.evalJs('VB.ctx.state');
    check(f1 - f0 > 100 && (st === 'playing' || st === 'over'), 'SIN RED: el partido corre 6 s (' + (f1 - f0) + ' fotogramas, ' + st + ')');
    await pg.evalJs('VB.ctx.actions.toMenu()'); await sleep(800);
    const mk = await pg.evalJs("(function(){var C=VB.Career;var c=C.create({mode:'beach',name:'Prueba Sin Red',num:7,role:'atk',seed:4243});var oi=Math.max(0,(c.offers||[]).findIndex(function(o){return !o.trial}));C.acceptOffer(oi,2);for(var i=0;i<6;i++){var n=C.next(C.get());if(n&&n.bench)C.benchNext();else break;}return !!C.matchSetup()})()");
    check(mk, 'SIN RED: Carrera nueva con partido que jugar');
    await pg.evalJs('VB.ctx.actions.startCareerMatch()');
    check(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&VB.ctx.game.career&&!VB.ctx.game.demo", 15000), 'SIN RED: empieza el partido de la Carrera');
    await pg.evalJs('VB.ctx.introSkipReq=true'); await sleep(3000);
    check(await pg.evalJs("VB.ctx.state==='playing'||VB.ctx.state==='over'"), 'SIN RED: el partido de la Carrera corre');
    const vj = await pg.evalJs("fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(function(r){return 'servida '+r.status},function(){return 'falla'})", true);
    check(vj === 'falla', 'SIN RED: version.json NO sale de la caché (' + vj + ')');
    const fsr = await pg.evalJs("fetch('https://firestore.googleapis.com/v1/projects/make-the-cut-vb/databases/(default)/documents/x').then(function(r){return 'servida '+r.status},function(){return 'falla'})", true);
    check(fsr === 'falla', 'SIN RED: Firestore NO sale de la caché (' + fsr + ')');
    const nf = await pg.evalJs("fetch('js/no-existe.js').then(function(r){return 'servida '+r.status},function(){return 'falla'})", true);
    check(nf === 'falla', 'SIN RED: un archivo fuera de la lista no sale de la caché (' + nf + ')');
    check(pg.errors.length === e1, 'SIN RED: sin errores de JS en el juego', pg.errors.slice(e1));
    await go(BASE + 'privacidad.html');
    check(await waitFor(pg, "document.readyState==='complete'&&/rivacidad/.test(document.title)&&!!document.getElementById('en')", 10000), 'SIN RED: privacidad.html abre (' + await pg.evalJs('document.title').catch(() => '?') + ')');
    check(S.log.length === nLog, 'SIN RED: ninguna petición llegó al servidor');

    // ================================================================ 3) publicación de la B
    console.log('3) publicación (B ' + VER_B + ')');
    root = SITE_B;
    S = await serve(() => root, S.port); await offline(false);
    const swMark = net.length;
    await go(BASE);
    check(await waitFor(pg, READY, 40000), 'con red: arranca (aún la ' + VER_A + ' o ya la nueva, según llegue el index)');
    const vNow = await pg.evalJs('VB.VERSION');
    // El index llega de la red (primero la red), así que la carga ya puede ser la B; para probar «Reiniciar» se vuelve a la A
    // sirviendo la A un momento si hace falta.
    if (vNow !== VER_A) {
      check(vNow === VER_B, 'la navegación va primero a la red: llega el index nuevo (' + vNow + ')');
      root = SITE_A; await go(BASE + '?back=1'); await waitFor(pg, READY, 40000); root = SITE_B;
    }
    check(await pg.evalJs('VB.VERSION') === VER_A, 'en la ' + VER_A + ' con la ' + VER_B + ' publicada');
    // durante un partido no sale el aviso
    await pg.evalJs("VB.ctx.actions.startMatch({format:'2v2',sets:1,points:15})");
    check(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo", 15000), 'partido empezado');
    await pg.evalJs('VB.Update.check(true)'); await sleep(2500);
    check(await pg.evalJs("VB.Update.latest") === VER_B && !(await pg.evalJs("!!document.getElementById('updReload')")), 'durante el partido NO sale «Hay una versión nueva» (sabe que hay la ' + VER_B + ')');
    const navs0 = navs;
    await pg.evalJs('VB.ctx.actions.toMenu()');
    check(await waitFor(pg, "!!document.getElementById('updReload')", 12000), 'al volver al menú sale «Hay una versión nueva» con «Reiniciar»');
    check(navs === navs0, 'nadie recarga solo (sin bucles)');
    await pg.evalJs("document.getElementById('updReload').click()");
    check(await waitFor(pg, "window.VB&&VB.VERSION==='" + VER_B + "'&&" + READY, 45000), '«Reiniciar» → arranca la ' + VER_B);
    check(await pg.evalJs("/[?&]u=/.test(location.search)"), 'la recarga lleva ?u=');
    const c2 = await pg.evalJs('caches.keys().then(JSON.stringify)', true).then(JSON.parse);
    check(c2.length === 1 && c2[0] === B.cache, 'la caché vieja se ha borrado: solo ' + B.cache, c2);
    check(await pg.evalJs('!!navigator.serviceWorker.controller'), 'la ' + VER_B + ' va controlada');
    const navs1 = navs; await sleep(6000);
    check(navs === navs1 && await pg.evalJs("VB.VERSION") === VER_B, 'sin bucles de recarga (6 s quieta en la ' + VER_B + ')');
    check(!(await pg.evalJs("!!document.getElementById('updReload')")), 'ya no sale «Hay una versión nueva»');
    // version.json y otra web nunca salen del service worker
    await pg.evalJs("fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(function(r){return r.text()})", true);
    await pg.evalJs("fetch('" + OTHER + "?t='+Date.now()).then(function(r){return r.text()})", true);
    await sleep(500);
    const vjs = net.slice(swMark).filter(n => /version\.json/.test(n.url));
    check(vjs.length >= 2 && vjs.every(n => !n.sw), 'version.json y la otra web nunca salen del service worker (' + vjs.length + ' respuestas)', vjs.filter(n => n.sw).map(n => n.url));
    const ckeys = await pg.evalJs("caches.open('" + B.cache + "').then(function(c){return c.keys()}).then(function(r){return JSON.stringify(r.map(function(x){return x.url}))})", true).then(JSON.parse);
    check(ckeys.length === B.files.length && !ckeys.some(u => /version\.json|:\d+\/version|googleapis/.test(u) || !u.startsWith(BASE)), 'la caché nueva solo tiene su lista (' + ckeys.length + ')');
    const jsFromSw = net.slice(swMark).filter(n => /\/js\/sim\.js/.test(n.url)).pop();
    check(jsFromSw && jsFromSw.sw, 'los js salen de la caché del service worker');

    // ================================================================ 4) sin red con la B
    console.log('4) sin red con la ' + VER_B);
    await S.stop(); await offline(true);
    await go(BASE);
    check(await waitFor(pg, READY, 40000) && await pg.evalJs('VB.VERSION') === VER_B, 'SIN RED: arranca la ' + VER_B);
    await pg.evalJs("VB.ctx.actions.startMatch({format:'2v2',sets:1,points:15})");
    check(await waitFor(pg, "VB.ctx.state==='playing'&&VB.ctx.game&&!VB.ctx.game.demo", 15000), 'SIN RED: partido en la ' + VER_B);
    await sleep(2000);
    check(pg.errors.length === e1, 'sin errores de JS en toda la prueba', pg.errors.slice(e1));
  } catch (e) {
    fails++; console.log('  FALLO excepción: ' + (e && e.stack || e));
  } finally {
    try { if (pg) pg.close(); } catch (e) { }
    try { if (S) await S.stop(); if (X) await X.stop(); } catch (e) { }
    if (!process.env.KEEP) { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { } } else console.log('(carpetas en ' + TMP + ')');
  }
  console.log('\n' + (fails ? 'offlinetest: ' + fails + ' FALLO(S), ' + oks + ' ok' : 'offlinetest: TODO OK (' + oks + ' comprobaciones)'));
  process.exit(fails ? 1 : 0);
})();
