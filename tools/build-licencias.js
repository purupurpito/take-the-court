#!/usr/bin/env node
/* TAKE THE COURT — tools/build-licencias.js (owner: ui_main, auditoría legal del 25-nov-2026)
 * Genera pages/licencias.html (https://takethecourt.com/licencias.html) con los textos COMPLETOS de las licencias de terceros, tal
 * cual están en el repo:
 *   - three.js (MIT): vendor/three/LICENSE
 *   - tipografías del juego (SIL OFL 1.1): vendor/fonts/OFL-*.txt (Barlow, Barlow Condensed, Bowlby One, Rubik, Titan One)
 *   - letras del logotipo, pasadas a trazos (SIL OFL 1.1): vendor/licenses/OFL-anton.txt y OFL-bungee.txt (de github.com/google/fonts)
 *   - Apache 2.0 (app de Android: Android Browser Helper, AndroidX, plantilla de Bubblewrap, Gradle wrapper; Firebase JS SDK):
 *     vendor/licenses/Apache-2.0.txt (de apache.org)
 * El estilo es el de pages/privacidad.html (se copia su <style>). tools/policytest.js comprueba que la página lleva exactamente esos
 * textos: si cambia uno, vuelve a generar la página con «node tools/build-licencias.js».
 * Uso: node tools/build-licencias.js [--check]   (--check: sale con 1 si la página no está al día, sin escribir nada)
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Licencias que salen en la página (id del ancla, título, para qué se usa en es y en, archivo). */
const LIC = [
  { id: 'three', t: 'three.js', es: 'Motor 3D del juego. Licencia MIT.', en: 'The game\'s 3D engine. MIT licence.', f: 'vendor/three/LICENSE' },
  { id: 'titanone', t: 'Titan One', es: 'Tipografía de los títulos (Rodrigo Fuenzalida). SIL Open Font License 1.1.', en: 'Title font (Rodrigo Fuenzalida). SIL Open Font License 1.1.', f: 'vendor/fonts/OFL-titanone.txt' },
  { id: 'bowlbyone', t: 'Bowlby One', es: 'Tipografía de respaldo de los títulos (Vernon Adams). SIL Open Font License 1.1.', en: 'Fallback title font (Vernon Adams). SIL Open Font License 1.1.', f: 'vendor/fonts/OFL-bowlbyone.txt' },
  { id: 'rubik', t: 'Rubik', es: 'Tipografía de los textos (The Rubik Project Authors). SIL Open Font License 1.1.', en: 'Body text font (The Rubik Project Authors). SIL Open Font License 1.1.', f: 'vendor/fonts/OFL-rubik.txt' },
  { id: 'barlow', t: 'Barlow', es: 'Tipografía del marcador (The Barlow Project Authors). SIL Open Font License 1.1.', en: 'Scoreboard font (The Barlow Project Authors). SIL Open Font License 1.1.', f: 'vendor/fonts/OFL-barlow.txt' },
  { id: 'barlowcondensed', t: 'Barlow Condensed', es: 'Tipografía del marcador (The Barlow Project Authors). SIL Open Font License 1.1.', en: 'Scoreboard font (The Barlow Project Authors). SIL Open Font License 1.1.', f: 'vendor/fonts/OFL-barlowcondensed.txt' },
  { id: 'anton', t: 'Anton', es: 'Letras del logotipo, pasadas a trazos (Vernon Adams). SIL Open Font License 1.1.', en: 'Logo lettering, converted to outlines (Vernon Adams). SIL Open Font License 1.1.', f: 'vendor/licenses/OFL-anton.txt' },
  { id: 'bungee', t: 'Bungee', es: 'Letras del logotipo, pasadas a trazos (David Jonathan Ross). SIL Open Font License 1.1.', en: 'Logo lettering, converted to outlines (David Jonathan Ross). SIL Open Font License 1.1.', f: 'vendor/licenses/OFL-bungee.txt' },
  { id: 'apache', t: 'Apache License 2.0', es: 'App de Android: Android Browser Helper (© Google LLC), AndroidX (© The Android Open Source Project), la plantilla de Bubblewrap (© Google Inc.) y el Gradle wrapper (© los autores de Gradle). También el Firebase JS SDK (© Google LLC), que el juego carga de Google para la cuenta.', en: 'Android app: Android Browser Helper (© Google LLC), AndroidX (© The Android Open Source Project), the Bubblewrap template (© Google Inc.) and the Gradle wrapper (© the Gradle authors). Also the Firebase JS SDK (© Google LLC), which the game loads from Google for accounts.', f: 'vendor/licenses/Apache-2.0.txt' }
];

function page() {
  const priv = fs.readFileSync(path.join(ROOT, 'pages', 'privacidad.html'), 'utf8');
  const style = (/<style>\n?([\s\S]*?)<\/style>/.exec(priv) || [])[1];
  if (!style) throw new Error('no encuentro el <style> de pages/privacidad.html');
  const list = lang => '<ul>\n' + LIC.map(l => '      <li><a href="#' + l.id + '">' + esc(l.t) + '</a>: ' + esc(l[lang]) + '</li>').join('\n') + '\n    </ul>';
  const texts = LIC.map(l => '  <details class="card lic" id="' + l.id + '">\n    <summary>' + esc(l.t) + '</summary>\n    <pre>' + esc(rd(l.f)) + '</pre>\n  </details>').join('\n');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#15102a">
<meta name="description" content="Licencias de las librerías y tipografías de terceros que usa Take the Court.">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<title>Licencias · Take the Court</title>
<!-- TAKE THE COURT — pages/licencias.html. GENERADA por tools/build-licencias.js: no la edites a mano (cambia el script o los textos
     de vendor/ y vuelve a generarla). Textos completos de las licencias de terceros; tools/policytest.js comprueba que están al día. -->
<style>
${style.replace(/\s+$/, '')}
.lic summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font:400 19px/1.2 var(--pop)}
.lic pre{margin:10px 0 0;padding:10px 12px;max-height:60vh;overflow:auto;border-radius:10px;background:#fff;box-shadow:inset 0 0 0 2px var(--ink);
  font:13px/1.45 ui-monospace,Consolas,"Liberation Mono",monospace;white-space:pre-wrap;overflow-wrap:anywhere}
</style>
</head>
<body>
<header class="top">
  <a class="brand" href="./">Take the Court</a>
  <nav class="langs" aria-label="Idioma / Language"><a href="#es" hreflang="es" lang="es" aria-label="Español">ES</a><a href="#en" hreflang="en" lang="en" aria-label="English">EN</a></nav>
</header>
<main>

<article class="doc" id="es" lang="es">
  <div class="hero">
    <p class="k">Licencias</p>
    <h1>Piezas de otros</h1>
    <p>El juego es obra de su titular, con todos los derechos reservados (mira el <a href="aviso-legal.html">aviso legal</a>). Usa además estas piezas de terceros, cada una con su licencia. Los textos completos están abajo, en su idioma original (inglés).</p>
  </div>
  <section class="card" aria-labelledby="es-1">
    <h2 id="es-1">Qué usamos</h2>
    ${list('es')}
  </section>
</article>

<article class="doc" id="en" lang="en">
  <div class="hero">
    <p class="k">Licences</p>
    <h1>Other people's work</h1>
    <p>The game is the work of its owner, with all rights reserved (see the <a href="aviso-legal.html#en">legal notice</a>). It also uses these third-party components, each under its own licence. The full texts are below.</p>
  </div>
  <section class="card" aria-labelledby="en-1">
    <h2 id="en-1">What we use</h2>
    ${list('en')}
  </section>
</article>

<section class="doc" id="textos" lang="en" aria-label="Licence texts">
${texts}
  <p><a class="back" href="./">Volver al juego</a></p>
</section>

<p class="foot"><a href="privacidad.html">Privacidad</a> · <a href="aviso-legal.html">Aviso legal</a> · <a href="condiciones.html">Condiciones</a> · <a href="#es">Español</a> · <a href="#en">English</a></p>
</main>
</body>
</html>
`;
}
module.exports = { LIC, page };
if (require.main === module) {
  const out = path.join(ROOT, 'pages', 'licencias.html'), html = page();
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (cur !== html) { console.error('pages/licencias.html no está al día: node tools/build-licencias.js'); process.exit(1); }
    console.log('pages/licencias.html al día'); process.exit(0);
  }
  fs.writeFileSync(out, html);
  console.log('pages/licencias.html: ' + LIC.length + ' licencias, ' + (html.length / 1024).toFixed(1) + ' KB');
}
