#!/usr/bin/env node
/* MAKE THE CUT — tools/csscheck.js  (owner: ui_main; spec móvil §0)
 * Guardia contra el fallo del 18-nov-2026: tres cabeceras de bloque de index.html sin su «/*» de apertura hacían que el navegador
 * se tragase la prosa como selector y tirase la PRIMERA regla de cada bloque (.sp-ov, .sp-medal, .sp-pill).
 * Uso: node tools/csscheck.js            → comprobación estática (sin navegador)
 *      node tools/csscheck.js --cssom    → además abre la página (tools/cdp.js) y mira document.styleSheets
 * Estática: en cada <style> de index.html los comentarios abren y cierran en pareja, ninguno queda abierto al final y toda línea
 * «   SPLAT · …» (cabecera de bloque) está dentro de un comentario; en js/*.js, dentro de los literales de cadena, tantos «/*» como «*\/».
 * CSSOM: hay reglas con .sp-medal, .sp-ov y .sp-pill, y ningún selector tiene 4+ palabras seguidas en minúscula (prosa tragada).
 * Escribe «csscheck OK» o la lista de problemas; sale con 1 si hay alguno.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const probs = [];

// ---------------------------------------------------------------- index.html
const html = fs.readFileSync(process.env.CSSCHECK_HTML || path.join(ROOT, 'index.html'), 'utf8');
const lines = html.split('\n');
let inStyle = false, inCom = false, styleStart = 0;
for (let ln = 0; ln < lines.length; ln++) {
  const L = lines[ln];
  if (!inStyle) {
    if (/<style[\s>]/.test(L)) { inStyle = true; inCom = false; styleStart = ln + 1; }
    else continue;
  }
  const startCom = inCom;
  if (/^\s+SPLAT ·/.test(L) && !startCom) probs.push('index.html:' + (ln + 1) + ' cabecera «SPLAT ·» fuera de comentario (falta el «/*» de la línea anterior)');
  // recorrer la línea
  for (let i = 0; i < L.length; i++) {
    if (!inCom && L[i] === '/' && L[i + 1] === '*') { inCom = true; i++; }
    else if (inCom && L[i] === '*' && L[i + 1] === '/') { inCom = false; i++; }
    else if (!inCom && L[i] === '*' && L[i + 1] === '/') { probs.push('index.html:' + (ln + 1) + ' «*/» sin «/*» que lo abra'); i++; }
    else if (!inCom && L.slice(i, i + 8) === '</style>') {
      inStyle = false;
      break;
    }
  }
  if (!inStyle && inCom) { probs.push('index.html: comentario abierto al cerrar el <style> de la línea ' + styleStart); inCom = false; }
}
if (inStyle) probs.push('index.html: <style> sin cerrar (línea ' + styleStart + ')');

// ---------------------------------------------------------------- js/*.js: CSS dentro de cadenas
const jsDir = path.join(ROOT, 'js');
fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).forEach(f => {
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  // solo los módulos que inyectan CSS (en los demás, una expresión regular como /'/ despista al lector de cadenas)
  if (!/createElement\(\s*['"]style['"]\s*\)|<style/.test(src)) return;
  let o = 0, c = 0;
  // literales '…' y "…" de una línea (el CSS de los módulos va en cadenas concatenadas); se saltan los comentarios de JS
  const re = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = re.exec(src))) {
    const s = m[0];
    if (s[0] === '/') continue;
    o += (s.match(/\/\*/g) || []).length;
    c += (s.match(/\*\//g) || []).length;
  }
  if (o !== c) probs.push('js/' + f + ': en las cadenas hay ' + o + ' «/*» y ' + c + ' «*/»');
});

// ---------------------------------------------------------------- CSSOM (opcional)
async function cssom() {
  const CDP = require('./cdp.js');
  let page;
  try {
    page = await CDP.open({ size: '1280x720' });
    await page.navigate('debug=menu'); await CDP.sleep(3500);
    const r = await page.evalJs(`(function(){
      var sels=[], bad=[], TAG=/^(a|b|i|p|s|u|em|div|span|nav|button|small|strong|svg|path|g|circle|rect|text|li|ul|ol|dl|dt|dd|table|tr|td|th|tbody|thead|input|label|select|img|canvas|h1|h2|h3|h4|h5|h6|section|header|footer|main|aside|article|kbd|textarea|option|summary|details|use|line|polygon|polyline|ellipse|textpath|tspan|defs)$/;
      function walk(rules){ for (var i=0;i<rules.length;i++){ var r=rules[i]; if (r.selectorText) sels.push(r.selectorText); if (r.cssRules) walk(r.cssRules); } }
      for (var i=0;i<document.styleSheets.length;i++){ try{ walk(document.styleSheets[i].cssRules); }catch(e){} }
      sels.forEach(function(s){
        var w = s.split(/[\\s,>+~()]+/), run=0;
        for (var k=0;k<w.length;k++){ if (/^[a-záéíóúñü]{2,}$/.test(w[k]) && !TAG.test(w[k])) { if (++run>=4) { bad.push(s.slice(0,140)); break; } } else run=0; }
      });
      var has=function(x){ return sels.some(function(s){ return s.indexOf(x)>=0; }); };
      return { n: sels.length, medal: has('.sp-medal'), ov: has('.sp-ov'), pill: has('.sp-pill'), bad: bad.slice(0,10) };
    })()`, true);
    if (!r.medal) probs.push('CSSOM: ninguna regla con .sp-medal');
    if (!r.ov) probs.push('CSSOM: ninguna regla con .sp-ov');
    if (!r.pill) probs.push('CSSOM: ninguna regla con .sp-pill');
    (r.bad || []).forEach(s => probs.push('CSSOM: selector con prosa tragada: ' + s));
    console.log('CSSOM: ' + r.n + ' selectores');
  } catch (e) { probs.push('CSSOM: ' + (e && e.message || e)); }
  if (page) page.close();
}

(async () => {
  if (process.argv.includes('--cssom')) await cssom();
  if (probs.length) { console.log('csscheck: ' + probs.length + ' problema(s)\n  ' + probs.join('\n  ')); process.exit(1); }
  console.log('csscheck OK');
  process.exit(0);
})();
