#!/usr/bin/env node
/* TAKE THE COURT — tools/build-pages.js (owner: ui_main)
 * Genera la versión para GitHub Pages en _site/ a partir de index.html (formato Artifact, sin doctype/html/head/body):
 * envuelve el contenido en un documento HTML5 completo (modo estándar, lang="es", charset) y copia js/.
 * Lo usa .github/workflows/pages.yml en cada push a main. Uso local: node tools/build-pages.js [salida=_site]
 * E7 (sprint 5): lee la versión de js/version.js (vm, sin DOM) e inyecta en el <head> la descripción, Open Graph, Twitter card,
 * canonical y window.__vbBuild = {v, sha, date} (sha = GITHUB_SHA de Actions, 7 caracteres; NO se llama a git). Quita el favicon
 * con data URI de index.html (en Pages manda icon.svg) y amplía el manifest (description, id, categories).
 * Guardas que hacen FALLAR el build: VB.VERSION ausente o no semver, CHANGELOG[0].v !== VERSION, falta pages/og.png, y un index
 * con más (o menos) de un rel="icon".
 * PAGES_URL=<url> cambia la dirección pública (por defecto https://takethecourt.com/, desde la 1.20.0; antes
 * https://purupurpito.github.io/make-the-cut/): canonical, og:url y la dirección absoluta de og:image. El resto del sitio va con rutas
 * RELATIVAS y funciona igual en la raíz de un dominio y en una subcarpeta.
 * PAGES_CNAME=<dominio> escribe _site/CNAME (por defecto takethecourt.com; PAGES_CNAME= vacío no lo escribe). OJO: con Pages desplegado
 * por Actions (este repo) GitHub IGNORA el archivo CNAME: el dominio se pone en Settings → Pages o con la API (bridge/README.md).
 * Se escribe igual para que el artefacto diga dónde vive y por si un día se publica desde una rama.
 * Google Play (24-nov-2026, notes/playstore/privacidad.md): pages/privacidad.html y pages/borrar-cuenta.html se copian a _site como el
 * resto de pages/ (https://takethecourt.com/privacidad.html y /borrar-cuenta.html). Llevan los huecos {{RESPONSABLE}} y
 * {{CONTACTO_EMAIL}} hasta que el dueño los rellene. Auditoría legal (25-nov-2026): también pages/aviso-legal.html (sin NIF ni domicilio desde el
 * 25-nov-2026), pages/condiciones.html y pages/licencias.html (generada por
 * tools/build-licencias.js); las cinco son POLICY_PAGES: misma comprobación de huecos y van al service worker como páginas. Por defecto el build solo AVISA si faltan o si quedan huecos {{...}};
 * con STRICT_POLICY=1 FALLA (úsalo antes de mandar la ficha a Google Play: STRICT_POLICY=1 node tools/build-pages.js).
 * pages/ se copia ENTERA y con subcarpetas (pages/.well-known/assetlinks.json → /.well-known/assetlinks.json para la TWA); el
 * .nojekyll de _site hace que GitHub Pages sirva las carpetas que empiezan por punto.
 * Sin red (24-nov-2026, notes/offline.md): three.js y las fuentes van en vendor/ (vendor/README.md) y se copian a _site/vendor; llevan
 * ?v=<hash> como los js. Se genera _site/sw.js a partir de la plantilla sw.js con la lista de TODO lo que necesita el juego (index,
 * js del index, vendor, woff2 de vendor/fonts/fonts.css, iconos, manifest, páginas legales) y el sha-256 de cada archivo; la caché
 * se llama 'ttc-<VB.VERSION>-<hash de la lista>', así cada publicación que cambia algún archivo estrena caché y el service
 * worker borra las viejas (el hash del index se calcula sin window.__vbBuild, que cambia en cada build: mismos archivos → mismo
 * sw.js). Luego escribe __vbBuild.sw = ese hash (js/sw-reg.js activa sin esperar el service worker de su propio build). Lo
 * registra js/sw-reg.js. Prueba: node tools/offlinetest.js.
 * Comentarios: lo publicado sale sin los comentarios de línea entera de js/ (vendor/ no se toca), sin los <!-- --> del index
 * y de pages/ ni los comentarios del CSS y de los <script> en línea del index; cada js resultante pasa node --check y los hash
 * (?v= y sw.js) se calculan después.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'), OUT = path.resolve(ROOT, process.argv[2] || '_site');
function fail(msg) { console.error('build-pages: ' + msg); process.exit(1); }
// ---- comentarios fuera de lo que se publica (conservador: si hay duda, el comentario se queda)
// JS: solo líneas enteras de // y bloques /* … */ que empiezan al principio de la línea y acaban la suya en */. Nunca los // de
// final de línea (un '//' dentro de un string con URL rompería el código). Las líneas dentro de un template literal multilínea no
// se tocan: se sigue el estado (strings, regex, plantillas) de lo que se queda; si al final del fichero no cuadra, el fichero se
// copia tal cual. Se respetan /*! … */ y los bloques con License, Copyright o @license.
const KEEP_BLOCK = /^\/\*!|License|Copyright|@license/;
function jsScan(line, st) {   // st.tpl: dentro de una plantilla `…`; st.blk: dentro de un /* … */ que empezó a media línea
  let prev = '';   // último carácter significativo fuera de strings (para distinguir una regex de una división)
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (st.blk) { if (c === '*' && line[i + 1] === '/') { st.blk = false; i++; } continue; }
    if (st.tpl) { if (c === '\\') i++; else if (c === '`') { st.tpl = false; prev = '`'; } continue; }
    if (c === ' ' || c === '\t') continue;
    if (c === '/' && line[i + 1] === '/') return;
    if (c === '/' && line[i + 1] === '*') { st.blk = true; i++; continue; }
    if (c === '`') { st.tpl = true; continue; }
    if (c === '"' || c === "'") {
      for (i++; i < line.length && line[i] !== c; i++) if (line[i] === '\\') i++;
      prev = c; continue;
    }
    if (c === '/' && (!prev || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev))) {   // regex literal
      let cls = false;
      for (i++; i < line.length; i++) {
        const d = line[i];
        if (d === '\\') { i++; continue; }
        if (cls) { if (d === ']') cls = false; } else if (d === '[') cls = true; else if (d === '/') break;
      }
      prev = '/'; continue;
    }
    prev = c;
  }
}
function stripJs(src) {
  const lines = src.split('\n'), out = [], st = { tpl: false, blk: false };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!st.tpl && !st.blk) {
      if (t.startsWith('//')) continue;
      if (t.startsWith('/*')) {
        let j = i, end = -1;
        for (; j < lines.length; j++) { const k = lines[j].indexOf('*/', j === i ? lines[i].indexOf('/*') + 2 : 0); if (k >= 0) { end = k; break; } }
        if (end >= 0 && lines[j].slice(end + 2).trim() === '' && !KEEP_BLOCK.test(lines.slice(i, j + 1).join('\n'))) { i = j; continue; }
      }
    }
    out.push(lines[i]);
    jsScan(lines[i], st);
  }
  return st.tpl || st.blk ? null : out.join('\n');   // null: el estado no cuadra al final → se copia sin tocar
}
// HTML: <!-- … --> fuera de <script> y <style>; con css, también los /* … */ de dentro de <style> (no /*!). Un comentario que
// ocupa líneas enteras se lleva sus líneas.
function stripHtml(html, css) {
  return html.split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/i).map((part, i) => {
    if (i % 2) {
      if (!css) return part;
      if (/^<script/i.test(part)) {   // script en línea del index: las mismas reglas que js/, y tiene que seguir compilando
        const m = /^(<script\b[^>]*>)([\s\S]*)(<\/script>)$/i.exec(part), body = m && stripJs(m[2]);
        if (!m || body == null || body === m[2]) return part;
        try { new vm.Script(body); } catch (e) { fail('un <script> del index no compila tras quitar comentarios (' + e.message + ')'); }
        return m[1] + body + m[3];
      }
      return part.replace(/^[ \t]*\/\*(?!!)(?:(?!\*\/)[\s\S])*\*\/[ \t]*\r?\n/gm, '').replace(/\/\*(?!!)(?:(?!\*\/)[\s\S])*\*\//g, '');
    }
    return part.replace(/^[ \t]*<!--(?:(?!-->)[\s\S])*-->[ \t]*\r?\n/gm, '').replace(/<!--(?:(?!-->)[\s\S])*-->/g, '');
  }).join('');
}
const srcRaw = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// El favicon con data URI de index.html (para file:// y el Artifact) sobra en Pages: manda icon.svg.
// (los valores entre comillas pueden llevar «>» sin escapar dentro del SVG, por eso se recorre atributo a atributo)
const linkTag = /[ \t]*<link\b(?:[^>"']|"[^"]*"|'[^']*')*>[ \t]*\r?\n?/gi;
const noDataIcon = s => s.replace(linkTag, t => /\brel=["'](?:shortcut )?icon["']/i.test(t) && /\bhref=["']\s*data:/i.test(t) ? '' : t);
const src = stripHtml(noDataIcon(srcRaw), true);
if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(srcRaw)) throw new Error('index.html ya trae doctype/html/head/body: revisa el formato Artifact');

// ---- versión: una sola fuente, js/version.js
const VBV = {};
try { vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'version.js'), 'utf8'), { VB: VBV, window: { VB: VBV } }); }
catch (e) { fail('no se puede leer js/version.js (' + e.message + ')'); }
const VERSION = VBV.VERSION;
if (typeof VERSION !== 'string' || !/^\d+\.\d+\.\d+$/.test(VERSION)) fail('VB.VERSION falta o no es semver x.y.z: ' + VERSION);
const C0 = Array.isArray(VBV.CHANGELOG) && VBV.CHANGELOG[0];
if (!C0 || C0.v !== VERSION) fail('CHANGELOG[0].v (' + (C0 && C0.v) + ') no coincide con VERSION ' + VERSION + ': añade arriba la entrada de la versión');
// el puente de la dirección antigua (bridge/version.json) tiene que decir la MISMA versión: js/update.js solo avisa a las pestañas viejas
// («Hay una versión nueva» → Reiniciar → puente) si es MAYOR que la que tienen (notes/dominio.md)
try { const bv = JSON.parse(fs.readFileSync(path.join(ROOT, 'bridge', 'version.json'), 'utf8')).v; if (bv !== VERSION) fail('bridge/version.json dice ' + bv + ' y VB.VERSION es ' + VERSION + ': ponlas iguales'); }
catch (e) { if (fs.existsSync(path.join(ROOT, 'bridge', 'version.json'))) fail('bridge/version.json ilegible (' + e.message + ')'); }
if (!fs.existsSync(path.join(ROOT, 'pages', 'og.png'))) fail('falta pages/og.png (se genera con node tools/og-image.js)');
// páginas legales de Google Play: con STRICT_POLICY=1 tienen que estar y sin huecos {{...}}; sin él, solo se avisa
const STRICT_POLICY = process.env.STRICT_POLICY === '1';
const POLICY_PAGES = ['privacidad.html', 'borrar-cuenta.html', 'aviso-legal.html', 'condiciones.html', 'licencias.html'];   // (las tres últimas: auditoría legal del 25-nov-2026)
const policyNotes = [];
for (const f of POLICY_PAGES) {
  const pf = path.join(ROOT, 'pages', f);
  if (!fs.existsSync(pf)) { if (STRICT_POLICY) fail('falta pages/' + f + ' (STRICT_POLICY=1)'); policyNotes.push('falta pages/' + f); continue; }
  const holes = [...new Set(fs.readFileSync(pf, 'utf8').match(/\{\{[A-Z0-9_]+\}\}/g) || [])];
  if (holes.length) { if (STRICT_POLICY) fail('pages/' + f + ' tiene huecos sin rellenar: ' + holes.join(', ') + ' (STRICT_POLICY=1)'); policyNotes.push(f + ' con ' + holes.join(', ')); }
}

let BASE = process.env.PAGES_URL || 'https://takethecourt.com/';
const CNAME = process.env.PAGES_CNAME != null ? String(process.env.PAGES_CNAME).trim() : 'takethecourt.com';
if (CNAME && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(CNAME)) fail('PAGES_CNAME no es un dominio: ' + CNAME);
if (!BASE.endsWith('/')) BASE += '/';
const DESC = 'Vóley cartoon en 3D: partidos 2 contra 2 y 6 contra 6, pista cubierta y playa, y una Carrera con fichajes, fama y ' +
  'Salón de la Fama. Gratis en móvil y ordenador, con mando, teclado o táctil.';
const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const BUILD_DATE = new Date().toISOString();
const SHA = String(process.env.GITHUB_SHA || '').replace(/[^0-9a-f]/gi, '').slice(0, 7);
const OG_IMG = BASE + 'og.png?v=' + require('crypto').createHash('sha1').update(fs.readFileSync(path.join(ROOT, 'pages', 'og.png'))).digest('hex').slice(0, 8); // por contenido: al cambiar la imagen, las redes la piden de nuevo
const metaTags = [
  '<meta name="description" content="' + attr(DESC) + '">',
  '<link rel="canonical" href="' + attr(BASE) + '">',
  '<meta property="og:type" content="website"><meta property="og:site_name" content="Take the Court"><meta property="og:locale" content="es_ES">',
  '<meta property="og:title" content="Take the Court"><meta property="og:description" content="' + attr(DESC) + '">',
  '<meta property="og:url" content="' + attr(BASE) + '"><meta property="og:image" content="' + attr(OG_IMG) + '">',
  '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' +
    '<meta property="og:image:alt" content="Logotipo de Take the Court">',
  '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="' + attr(OG_IMG) + '">',
  '<meta name="application-name" content="Take the Court">',
  '<script>window.__vbBuild=' + JSON.stringify({ v: VERSION, sha: SHA, date: BUILD_DATE }).replace(/</g, '\\u003c') + '</script>'
].join('\n');

// Las etiquetas de cabecera iniciales (title, meta, link) van al <head>; el resto (style, marcado, scripts) al <body>.
const m = /^(\s*(?:<title>[\s\S]*?<\/title>|<meta\b[^>]*>|<link\b[^>]*>)\s*)+/i.exec(src);
let head = m ? m[0] : '', body = src.slice(head.length);
// Además, TODAS las líneas que son solo una etiqueta <meta>/<link> (p. ej. el viewport, que en index.html va tras el primer
// <script>) suben al <head>: un <meta name="viewport"> en el <body> lo ignoran los móviles (zoom con doble toque).
const lone = /^[ \t]*<(?:meta|link)\b[^>]*>[ \t]*\r?\n/gim;
head += (body.match(lone) || []).join(''); body = body.replace(lone, '');
// Versión instalable (PWA): «Añadir a pantalla de inicio» abre el juego a pantalla completa, sin barra de direcciones
// (en iPhone es la única forma: Safari no tiene API de pantalla completa para páginas).
const pwa = '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon.svg" type="image/svg+xml">\n' +
  '<link rel="apple-touch-icon" href="icon-180.png">\n<meta name="mobile-web-app-capable" content="yes">\n' +
  '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
  '<meta name="apple-mobile-web-app-title" content="Take the Court">';
const html = '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n' + head.trim() + '\n' + pwa + '\n' + metaTags +
  '\n</head>\n<body>\n' + body.trim() + '\n</body>\n</html>\n';
const manifest = { id: './', name: 'Take the Court', short_name: 'Take the Court', description: DESC, categories: ['games', 'sports'],
  lang: 'es', start_url: './', scope: './', display: 'fullscreen',
  orientation: 'landscape', background_color: '#070b14', theme_color: '#070b14',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }, { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }] };
// Cada script lleva ?v=<hash de su contenido>: así el navegador (y la caché de 10 min de GitHub Pages) no sirve un js viejo
// con un index nuevo. El index.html sí puede tardar esos 10 min en renovarse; los js que referencia son siempre los suyos.
const crypto = require('crypto');
const JS = new Map(), jsKept = [];   // js/ sin comentarios (lo que se publica y de lo que salen los hash)
for (const f of fs.readdirSync(path.join(ROOT, 'js'))) if (f.endsWith('.js')) {
  const raw = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), st = stripJs(raw);
  if (st == null) jsKept.push(f);
  JS.set(f, st == null ? raw : st);
}
const ver = f => crypto.createHash('sha1').update(JS.has(f) ? JS.get(f) : fs.readFileSync(path.join(ROOT, 'js', f))).digest('hex').slice(0, 8);
const hashOf = rel => crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 8);
const htmlV = html.replace(/src="js\/([A-Za-z0-9_-]+\.js)"/g, (m, f) => 'src="js/' + f + '?v=' + ver(f) + '"')
  .replace(/(src|href)="(vendor\/[A-Za-z0-9_\/.-]+\.(?:js|css))"/g, (m, a, f) => a + '="' + f + '?v=' + hashOf(f) + '"');
if (/https:\/\/(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/.test(htmlV)) fail('el index todavía pide three.js o las fuentes a otra web: tienen que ir en vendor/ (notes/offline.md)');
const icons = (htmlV.match(/<link\b[^>]*\brel=["'](?:shortcut )?icon["']/gi) || []).length;
if (icons !== 1) fail('el index de Pages tiene ' + icons + ' rel="icon" (debe haber uno, icon.svg)');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), htmlV);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
if (CNAME) fs.writeFileSync(path.join(OUT, 'CNAME'), CNAME + '\n');   // (Pages por Actions lo ignora: ver la cabecera)
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(OUT, 'version.json'), JSON.stringify({ v: VERSION }));   // (js/update.js: aviso de versión nueva en los móviles con una anterior)
fs.cpSync(path.join(ROOT, 'pages'), OUT, { recursive: true }); // iconos, og.png, páginas legales y .well-known/ (con subcarpetas)
if (fs.existsSync(path.join(ROOT, 'vendor'))) fs.cpSync(path.join(ROOT, 'vendor'), path.join(OUT, 'vendor'), { recursive: true, filter: f => !/README\.md$/i.test(f) }); // three.js, fuentes y sus licencias
for (const [f, txt] of JS) fs.writeFileSync(path.join(OUT, 'js', f), txt);
{ const cp = require('child_process'), bad = [];
  for (const f of JS.keys()) { const r = cp.spawnSync(process.execPath, ['--check', path.join(OUT, 'js', f)], { encoding: 'utf8' }); if (r.status !== 0) bad.push(f); }
  if (bad.length) fail('node --check falla tras quitar comentarios en: ' + bad.join(', '));
}
if (jsKept.length) console.log('build-pages: aviso: copiados con comentarios (el recuento de strings no cuadra): ' + jsKept.join(', '));
(function stripPages(dir) {   // <!-- --> de las páginas de pages/ copiadas
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (p !== path.join(OUT, 'js') && p !== path.join(OUT, 'vendor')) stripPages(p); }
    else if (/.html$/i.test(e.name) && p !== path.join(OUT, 'index.html')) fs.writeFileSync(p, stripHtml(fs.readFileSync(p, 'utf8'), false));
  }
})(OUT);
// ---- service worker (sw.js): lista de lo que hace falta para jugar sin red, con el sha-256 de cada archivo
// (las copias mínimas de abouttest/policytest no llevan la plantilla sw.js: entonces no hay service worker y se avisa)
const swTplFile = path.join(ROOT, 'sw.js'), hasSw = fs.existsSync(swTplFile);
let swCfg = null, preBytes = 0;
if (hasSw) {
  // El index lleva window.__vbBuild (sha del commit y fecha del build): cambia en CADA build aunque no cambie nada más. Su sha-256
  // se calcula SIN ese <script> (n:1; sw.js hace lo mismo al comprobarlo), para que un build con los mismos archivos dé el mismo
  // sw.js y la misma caché: los móviles no vuelven a bajarlo todo por un push que solo toca notas o pruebas (notes/offline.md).
  const VBB = /<script>window\.__vbBuild=[^<]*<\/script>/;
  const sha256 = (rel, norm) => { let b = fs.readFileSync(path.join(OUT, rel.split('?')[0])); if (norm) b = Buffer.from(b.toString('utf8').replace(VBB, ''), 'utf8'); return crypto.createHash('sha256').update(b).digest('hex'); };
  const pre = new Map();
  const addPre = (u, page) => { if (!pre.has(u)) { if (!fs.existsSync(path.join(OUT, u.split('?')[0]))) fail('sw: falta ' + u + ' en ' + OUT); const norm = u === 'index.html'; pre.set(u, Object.assign({ u, h: sha256(u, norm) }, page ? { page: 1 } : {}, norm ? { n: 1 } : {})); } };
  addPre('index.html', true);
  for (const f of POLICY_PAGES) if (fs.existsSync(path.join(OUT, f))) addPre(f, true);
  for (const mm of htmlV.matchAll(/\b(?:src|href)="((?:js|vendor)\/[^"#]+)"/g)) addPre(mm[1]);
  for (const mm of htmlV.matchAll(/<link\b[^>]*\bhref="([A-Za-z0-9_.-]+\.(?:svg|png|webmanifest))"/g)) addPre(mm[1]);
  for (const ic of manifest.icons) addPre(ic.src);
  for (const css of [...pre.keys()].filter(u => /\.css(\?|$)/.test(u))) {
    const dir = path.posix.dirname(css.split('?')[0]);
    for (const mm of fs.readFileSync(path.join(OUT, css.split('?')[0]), 'utf8').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      if (/^(data:|https?:|\/)/.test(mm[1])) fail('sw: ' + css + ' pide ' + mm[1] + ' (solo rutas relativas de vendor/)');
      addPre(path.posix.join(dir, mm[1]));
    }
  }
  const preList = [...pre.values()];
  const SWHASH = crypto.createHash('sha256').update(preList.map(f => f.u + ' ' + f.h).join('\n')).digest('hex').slice(0, 10);
  swCfg = { v: VERSION, hash: SWHASH, cache: 'ttc-' + VERSION + '-' + SWHASH, files: preList };
  // El index sabe qué service worker es el suyo (__vbBuild.sw): js/sw-reg.js activa enseguida uno que espera si es el de esta
  // misma versión (la página ya corre esos archivos), para que una recarga sin red no vuelva al index anterior guardado.
  const idx = path.join(OUT, 'index.html'), idxSrc = fs.readFileSync(idx, 'utf8');
  if (!VBB.test(idxSrc)) fail('sw: el index no lleva window.__vbBuild');
  fs.writeFileSync(idx, idxSrc.replace(VBB, () => '<script>window.__vbBuild=' + JSON.stringify({ v: VERSION, sha: SHA, date: BUILD_DATE, sw: SWHASH }).replace(/</g, '\\u003c') + '</script>'));
  if (sha256('index.html', true) !== pre.get('index.html').h) fail('sw: el hash del index cambió al poner __vbBuild.sw');
  const swTpl = fs.readFileSync(swTplFile, 'utf8');
  if (!swTpl.includes('var VB_SW = null; /*@@VB_SW@@*/')) fail('sw.js sin la línea «var VB_SW = null; /*@@VB_SW@@*/»');
  fs.writeFileSync(path.join(OUT, 'sw.js'), swTpl.replace('var VB_SW = null; /*@@VB_SW@@*/', () => 'var VB_SW = ' + JSON.stringify(swCfg) + ';'));
  preBytes = preList.reduce((n, f) => n + fs.statSync(path.join(OUT, f.u.split('?')[0])).size, 0);
}
if (policyNotes.length) console.log('build-pages: aviso (páginas legales): ' + policyNotes.join('; ') + '. Con STRICT_POLICY=1 el build fallaría.');
console.log('Pages listo en ' + OUT + ' (' + fs.readdirSync(path.join(OUT, 'js')).length + ' scripts, v' + VERSION + (SHA ? ' ' + SHA : '') + ', ' + BASE + (CNAME ? ', CNAME ' + CNAME : '') + ')');
if (!hasSw) console.log('build-pages: aviso: no hay plantilla sw.js, la web sale SIN service worker (no se podrá jugar sin red)');
else console.log('sw.js: caché ' + swCfg.cache + ', ' + swCfg.files.length + ' archivos para jugar sin red (' + (preBytes / 1048576).toFixed(2) + ' MB)');
