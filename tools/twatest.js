#!/usr/bin/env node
/* TAKE THE COURT — tools/twatest.js (owner: Google Play, TWA, 24-nov-2026; notes/playstore/android.md)
 * Pruebas sin red, sin navegador y sin Android SDK de la app de Android (TWA de Bubblewrap en android/) y de
 * pages/.well-known/assetlinks.json:
 *  1) assetlinks.json: JSON válido, una sola declaración delegate_permission/common.handle_all_urls para android_app, el paquete es
 *     el packageId de android/twa-manifest.json y cada huella es un hueco {{...}} o un SHA-256 «AA:BB:…» (32 pares, mayúsculas),
 *     sin repetir. Con huecos avisa; STRICT_TWA=1 falla si queda alguno (antes de publicar la app).
 *  2) android/twa-manifest.json frente al manifest de la web (el que escribe tools/build-pages.js): host takethecourt.com, startUrl
 *     «/», display y orientation iguales que la web (fullscreen / landscape), colores = theme_color y background_color, sin
 *     notificaciones, fallback customtabs, sin features (ni Play Billing ni ubicación), versión 1+, signingKey fuera del repo.
 *     El icono adaptable (maskableIconUrl) existe en pages/, es igual a notes/playstore/graficos/icono-512.png y el manifest de la
 *     web lo anuncia como maskable (bubblewrap update lo baja de takethecourt.com).
 *     manifest-checksum.txt = sha1 del twa-manifest.json (si no, `bubblewrap build` pregunta si regenerar). app/build.gradle dice lo
 *     mismo (applicationId, hostName, versionCode/Name, minSdk, orientation) y targetSdk >= 35 (Play pide el del año: ver checklist 4.5).
 *  3) Claves: android/.gitignore ignora *.keystore y *.jks y no hay ninguna clave ni compilado en android/ ni en git.
 *  4) build-pages: _site/.well-known/assetlinks.json igual que el de pages/ y .nojekyll. Si el build aún copia pages/ archivo a
 *     archivo (falla con EISDIR, o EPERM en Windows, por la carpeta .well-known), se SALTA con aviso: ese cambio es de tools/build-pages.js.
 * Uso: node tools/twatest.js     Sale con 1 si falla algo.
 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const AND = path.join(ROOT, 'android');
const AL = path.join(ROOT, 'pages', '.well-known', 'assetlinks.json');
let fails = 0, oks = 0, notes = [];
const check = (c, m, extra) => { if (c) { oks++; console.log('  ok   ' + m); } else { fails++; console.log('  FALLO ' + m + (extra !== undefined ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
const note = m => { notes.push(m); console.log('  AVISO ' + m); };
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return { __err: String(e.message || e) }; } };
const HOLE = /^\{\{[A-Z0-9_]+\}\}$/, SHA = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

// ---------------------------------------------------------------- 2a) twa-manifest (se lee antes: da el paquete)
const twaFile = path.join(AND, 'twa-manifest.json');
const twa = fs.existsSync(twaFile) ? readJson(twaFile) : { __err: 'no existe' };

// ---------------------------------------------------------------- 1) assetlinks.json
console.log('1) pages/.well-known/assetlinks.json');
const al = fs.existsSync(AL) ? readJson(AL) : { __err: 'no existe' };
if (check(!al.__err, 'existe y es JSON válido', al.__err)) {
  check(Array.isArray(al) && al.length === 1, 'una lista con una declaración');
  const st = Array.isArray(al) ? al[0] || {} : {}, t = st.target || {};
  check(Array.isArray(st.relation) && st.relation.length === 1 && st.relation[0] === 'delegate_permission/common.handle_all_urls', 'relation = delegate_permission/common.handle_all_urls', st.relation);
  check(t.namespace === 'android_app', 'namespace android_app');
  check(typeof t.package_name === 'string' && t.package_name === twa.packageId, 'package_name = packageId de android/twa-manifest.json (' + t.package_name + ')', twa.packageId);
  const fp = t.sha256_cert_fingerprints;
  check(Array.isArray(fp) && fp.length >= 1, 'hay huellas sha256_cert_fingerprints');
  const list = Array.isArray(fp) ? fp : [];
  check(list.every(x => typeof x === 'string' && (HOLE.test(x) || SHA.test(x))), 'cada huella es un hueco {{...}} o un SHA-256 AA:BB:… (32 pares en mayúsculas)', list.filter(x => !(HOLE.test(x) || SHA.test(x))));
  check(new Set(list).size === list.length, 'sin huellas repetidas');
  const holes = list.filter(x => HOLE.test(x));
  if (holes.length) {
    if (process.env.STRICT_TWA === '1') check(false, 'STRICT_TWA=1: no quedan huecos en las huellas', holes);
    else note('quedan huecos en las huellas (' + holes.join(', ') + '): rellenarlas antes de publicar la app (notes/playstore/android.md §5). STRICT_TWA=1 lo haría fallar.');
  } else check(list.length >= 2, 'huellas reales: al menos dos (firma de Play y clave de subida)', list.length);
}

// ---------------------------------------------------------------- 2) twa-manifest frente a la web
console.log('2) android/twa-manifest.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vbtwa-'));
const SITE = path.join(tmp, 'site');
const env = Object.assign({}, process.env); delete env.STRICT_POLICY;
const b = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build-pages.js'), SITE], { env, encoding: 'utf8' });
const bOut = (b.stdout || '') + (b.stderr || '');
const buildOk = b.status === 0;
// El manifest de la web: el del build; si el build no sale, el objeto `manifest` de build-pages.js (mismos valores).
let web = buildOk ? readJson(path.join(SITE, 'manifest.webmanifest')) : null;
if (!web) {
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'build-pages.js'), 'utf8');
  const g = k => (new RegExp('\\b' + k + ":\\s*'([^']*)'").exec(src) || [])[1];
  web = { display: g('display'), orientation: g('orientation'), theme_color: g('theme_color'), background_color: g('background_color') };
}
if (check(!twa.__err, 'existe y es JSON válido', twa.__err)) {
  check(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(twa.packageId || ''), 'packageId con formato de paquete Android (' + twa.packageId + ')');
  check(twa.host === 'takethecourt.com', 'host takethecourt.com', twa.host);
  check(twa.startUrl === '/', 'startUrl «/»', twa.startUrl);
  check(twa.fullScopeUrl === 'https://takethecourt.com/', 'fullScopeUrl https://takethecourt.com/', twa.fullScopeUrl);
  check(twa.name === 'Take the Court' && twa.launcherName === 'Take the Court', 'name y launcherName «Take the Court»', [twa.name, twa.launcherName]);
  check(twa.display === web.display && twa.display === 'fullscreen', 'display = el de la web (fullscreen)', [twa.display, web.display]);
  check(twa.orientation === web.orientation && twa.orientation === 'landscape', 'orientation = la de la web (landscape)', [twa.orientation, web.orientation]);
  const up = s => String(s || '').toUpperCase();
  check(['themeColor', 'themeColorDark', 'navigationColor', 'navigationColorDark'].every(k => up(twa[k]) === up(web.theme_color)), 'colores de tema y navegación = theme_color (' + web.theme_color + ')');
  check(up(twa.backgroundColor) === up(web.background_color), 'backgroundColor (pantalla de arranque) = background_color', [twa.backgroundColor, web.background_color]);
  check(/^https:\/\/takethecourt\.com\/[^/]+\.png$/.test(twa.iconUrl || ''), 'iconUrl en takethecourt.com (' + twa.iconUrl + ')');
  check(twa.iconUrl !== 'https://takethecourt.com/icon-512.png' || fs.existsSync(path.join(ROOT, 'pages', 'icon-512.png')), 'el icono existe en pages/');
  if (twa.maskableIconUrl) {
    const f = twa.maskableIconUrl.replace('https://takethecourt.com/', '');
    check(fs.existsSync(path.join(ROOT, 'pages', f)), 'el icono adaptable (maskableIconUrl → ' + f + ') existe en pages/ (bubblewrap update lo baja de la web)');
    if (fs.existsSync(path.join(ROOT, 'pages', f))) check(fs.readFileSync(path.join(ROOT, 'pages', f)).equals(fs.readFileSync(path.join(ROOT, 'notes', 'playstore', 'graficos', 'icono-512.png'))), 'pages/' + f + ' = notes/playstore/graficos/icono-512.png (dibujo al 82 %)');
    check(web.icons ? web.icons.some(i => i.src === f && i.purpose === 'maskable') : fs.readFileSync(path.join(ROOT, 'tools', 'build-pages.js'), 'utf8').includes("src: '" + f + "', sizes: '512x512', type: 'image/png', purpose: 'maskable'"), 'el manifest de la web anuncia ' + f + ' como maskable');
  }
  check(twa.enableNotifications === false, 'sin notificaciones');
  check(twa.fallbackType === 'customtabs', 'fallback customtabs (no WebView)', twa.fallbackType);
  check(twa.features && typeof twa.features === 'object' && !Object.keys(twa.features).length, 'sin features (ni Play Billing, ni ubicación, ni Firebase)', twa.features);
  check(!twa.shortcuts || !twa.shortcuts.length, 'sin atajos');
  check(Number.isInteger(twa.appVersionCode) && twa.appVersionCode >= 1, 'appVersionCode entero >= 1 (' + twa.appVersionCode + ')');
  check(/^\d+\.\d+\.\d+$/.test(twa.appVersionName || '') && twa.appVersion === twa.appVersionName, 'appVersionName x.y.z (' + twa.appVersionName + ')');
  check(Number.isInteger(twa.minSdkVersion) && twa.minSdkVersion >= 24, 'minSdkVersion >= 24 (androidbrowserhelper lo pide; ' + twa.minSdkVersion + ')');
  const kp = (twa.signingKey || {}).path || '';
  const inRepo = !/\{\{/.test(kp) && path.resolve(AND, kp).toLowerCase().startsWith(path.resolve(ROOT).toLowerCase() + path.sep);
  check(kp && !inRepo, 'signingKey.path fuera del repo (o hueco) (' + kp + ')');
  const sumF = path.join(AND, 'manifest-checksum.txt');
  const sum = fs.existsSync(sumF) ? fs.readFileSync(sumF, 'utf8').trim() : '';
  check(sum === crypto.createHash('sha1').update(fs.readFileSync(twaFile)).digest('hex'), 'manifest-checksum.txt = sha1 de twa-manifest.json (si no, `bubblewrap build` pregunta si regenerar)');

  const gr = fs.existsSync(path.join(AND, 'app', 'build.gradle')) ? fs.readFileSync(path.join(AND, 'app', 'build.gradle'), 'utf8') : '';
  const gv = re => (re.exec(gr) || [])[1];
  check(gv(/applicationId\s+"([^"]+)"/) === twa.packageId, 'build.gradle: applicationId = packageId');
  check(gv(/hostName:\s*'([^']+)'/) === twa.host && gv(/launchUrl:\s*'([^']+)'/) === twa.startUrl, 'build.gradle: hostName y launchUrl');
  check(+gv(/versionCode\s+(\d+)/) === twa.appVersionCode && gv(/versionName\s+"([^"]*)"/) === twa.appVersionName, 'build.gradle: versionCode y versionName');
  check(+gv(/minSdkVersion\s+(\d+)/) === twa.minSdkVersion, 'build.gradle: minSdkVersion');
  check(gv(/orientation:\s*'([^']+)'/) === twa.orientation, 'build.gradle: orientation');
  check(gv(/enableNotifications:\s*(\w+)/) === 'false', 'build.gradle: enableNotifications false');
  const tsdk = +gv(/targetSdkVersion\s+(\d+)/);
  check(tsdk >= 35, 'build.gradle: targetSdkVersion >= 35 (' + tsdk + ')');
  if (tsdk < 36) note('targetSdkVersion ' + tsdk + ': desde el 31-ago-2026 Play espera 36 (comprobar en la Consola).');
  const am = fs.existsSync(path.join(AND, 'app', 'src', 'main', 'AndroidManifest.xml')) ? fs.readFileSync(path.join(AND, 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8') : '';
  check(am && !/ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|com\.android\.vending\.BILLING/.test(am), 'AndroidManifest.xml sin permisos de ubicación ni de compras');
  check(fs.existsSync(path.join(AND, 'gradlew')) && fs.existsSync(path.join(AND, 'gradle', 'wrapper', 'gradle-wrapper.jar')), 'proyecto generado (gradlew y gradle-wrapper.jar)');
}

// ---------------------------------------------------------------- 3) claves y compilados
console.log('3) claves fuera del repo');
const gi = fs.existsSync(path.join(AND, '.gitignore')) ? fs.readFileSync(path.join(AND, '.gitignore'), 'utf8').split(/\r?\n/) : [];
check(['*.keystore', '*.jks', 'local.properties', '.gradle/', 'build/', '*.apk', '*.aab'].every(p => gi.includes(p)), 'android/.gitignore ignora claves, local.properties, .gradle, build, apk y aab');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (['.gradle', 'build'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const bad = fs.existsSync(AND) ? walk(AND).filter(f => /\.(keystore|jks|p12|apk|aab|idsig)$/i.test(f)).map(f => path.relative(ROOT, f)) : [];
check(!bad.length, 'ninguna clave ni compilado dentro de android/', bad);
const g = cp.spawnSync('git', ['ls-files', '--', 'android', 'pages/.well-known'], { cwd: ROOT, encoding: 'utf8' });
const tracked = (g.stdout || '').split('\n').filter(f => /\.(keystore|jks|p12|apk|aab)$|local\.properties$/i.test(f));
if (g.status !== 0) note('sin git aquí: no se mira qué lleva el repo');
else check(!tracked.length, 'git no lleva ninguna clave, compilado ni local.properties', tracked);

// ---------------------------------------------------------------- 4) build-pages
console.log('4) build-pages');
if (!buildOk && /\b(EISDIR|EPERM)\b/.test(bOut) && /copyfile[^\n]*\.well-known/.test(bOut)) {
  note('SALTADO: tools/build-pages.js aún copia pages/ archivo a archivo y falla con la carpeta pages/.well-known (EISDIR/EPERM). Falta que copie pages/.well-known/ a _site/.well-known/ (pista P2-A).');
} else if (check(buildOk, 'build-pages sale con 0', bOut.trim().slice(-400))) {
  const out = path.join(SITE, '.well-known', 'assetlinks.json');
  check(fs.existsSync(out) && fs.readFileSync(out, 'utf8') === fs.readFileSync(AL, 'utf8'), '_site/.well-known/assetlinks.json igual que pages/.well-known/assetlinks.json');
  check(fs.existsSync(path.join(SITE, '.nojekyll')), '_site/.nojekyll (sin Jekyll se sirven las carpetas con punto)');
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
console.log((fails ? 'FALLOS: ' + fails : 'TODO OK') + ' (' + oks + ' ok' + (notes.length ? ', ' + notes.length + ' avisos' : '') + ')');
process.exit(fails ? 1 : 0);
