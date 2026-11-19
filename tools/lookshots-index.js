#!/usr/bin/env node
/* MAKE THE CUT — tools/lookshots-index.js: escribe tools/out/look-audit/INDEX.md a partir del manifest.json de tools/lookshots.js.
 * Uso: node tools/lookshots-index.js [carpeta]   (por defecto tools/out/look-audit) */
'use strict';
const fs = require('fs'), path = require('path');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'out', 'look-audit'));
const man = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
const files = Object.keys(man).filter(f => fs.existsSync(path.join(OUT, f))).sort();
const by = {};
for (const f of files) { const g = f.split('/')[0]; (by[g] = by[g] || []).push(f); }
const ORDER = ['base', 'hair', 'head', 'torso', 'legs', 'combos', 'game-distance'];
const L = [];
L.push('# Auditoría del Vestuario: hojas de contacto');
L.push('');
L.push('Generado por `tools/lookshots.js` (capturas) y `tools/lookshots-index.js` (este índice). ' + files.length + ' hojas (JPEG calidad 0,86 por falta de disco; --fmt=png para PNG). Rutas relativas a esta carpeta.');
L.push('');
L.push('## Cómo leer las hojas');
L.push('');
L.push('- Primeros planos (base, hair, head, torso, legs, combos): vista previa real del Vestuario (`VB.Doll.preview`, mismo renderer, luces, tinta y post-proceso del juego), calidad alta = LOD2, atlas px=2, pose `stand` congelada (tFix=0), ojos abiertos. Cámara propia de 30° en un viewport 768x768.');
L.push('- Encuadre según la ranura: cabeza (head, eyes, paint, marks, beard, peinados), busto (neck), torso (under, band, arm, elbows, wrist, hands), piernas (legs, knees, socks), pies (ankle, shoes).');
L.push('- Hoja de objeto = 2 filas × 6: fila 1 piel clara (0xf7dcc4) + kit A (blanco/rojo, liso) y fila 2 piel oscura (0x5a3626) + kit B (marino/amarillo, diagonal). Columnas: frente · 3/4 izquierda · lado derecho · espalda · desde arriba 35° · cuerpo entero (frente en la fila 1, espalda en la fila 2).');
L.push('- Base de cada objeto = «de serie»: tupé castaño, sin complementos, pero en pista con rodilleras, calcetines, tobillera y zapatillas de serie (lo que lleva todo muñeco de pabellón). El objeto pasa por `VB.Look.fix`, así que las reglas de compatibilidad se aplican; lo que quitan sale en la línea azul de la hoja («QUITADO POR REGLAS») y la etiqueta lleva « !».');
L.push('- Objetos de dos ranuras (manguitos/kinesio: armL+armR; muñequeras/reloj: wristL+wristR) se ponen en las DOS.');
L.push('- Peinados: 4 filas × 6: filas 1-2 como un objeto; fila 3 = 3/4 izquierda en castaño oscuro, negro, rubio, canas, cobrizo y tinte azul; fila 4 = piel oscura con rosa/rubio desde arriba, canas/castaño de espalda, rubio de lado (entero) y busto de espalda.');
L.push('- Distancia de juego (game-distance): escena de partido real con la cámara de partido y el LOD que elige players.js. Pista = `?debug=rally6h&map=palau` (6v6, tu atleta OH lleva el look; se ve DE ESPALDA, como en el juego). Playa = `?debug=rally&map=beach` (2v2, tus dos atletas llevan el look; se marca el n.º 1). Escritorio 1280x720 calidad alta; móvil 640x360 táctil, dpr 2, UA Android → calidad media (LOD1, pixelRatio 1,25 → lienzo 800x450). Cada fila: [fotograma entero escalado, recorte nativo ampliado sin suavizar] × [clara/A, oscura/B]. La etiqueta da el alto del atleta en px del lienzo y el LOD real.');
L.push('');
L.push('## Volver a generar');
L.push('');
L.push('```');
L.push('node tools/lookshots.js                                   # todo (≈ 10-15 min, un Chrome cada vez)');
L.push('node tools/lookshots.js head --item=gorra                 # un objeto, sus sedes (head/head-gorra-beach.jpg)');
L.push('node tools/lookshots.js hair --item=coletas --venue=hall  # un peinado en una sede');
L.push('node tools/lookshots.js torso,game --item=manguitoLlamas  # primeros planos + distancia de juego de un objeto');
L.push('node tools/lookshots.js combos --item=c_all_hall          # un combo');
L.push('node tools/lookshots.js base                              # hojas de referencia');
L.push('node tools/lookshots-index.js                             # rehace este INDEX.md desde manifest.json');
L.push('```');
L.push('');
L.push('Grupos: `base,hair,head,torso,legs,combos,game`. Opciones: `--item=id[,id]` (ids del catálogo, peinados, `base`, ids de combo), `--venue=hall|beach`, `--out=carpeta`, `--fmt=png`. Con `--item` en game el fichero lleva los ids en el nombre (`game-distance/hall-desktop-<ids>-01.jpg`).');
L.push('');
for (const g of ORDER.concat(Object.keys(by).filter(k => ORDER.indexOf(k) < 0))) {
  if (!by[g]) continue;
  L.push('## ' + g + ' (' + by[g].length + ')');
  L.push('');
  for (const f of by[g]) {
    const e = man[f];
    let what;
    if (g === 'game-distance') what = (e.venue === 'beach' ? 'playa' : 'pista') + ' · ' + e.device + ' · q=' + e.quality + ' · objetos: ' + (e.items || []).join(', ') +
      (e.rows ? ' · alto/LOD: ' + e.rows.map(r => r.tag.split(' ')[0] + '(' + r.tag.split(' ')[1] + ') ' + r.hpx + 'px L' + r.lod).filter((v, i) => i % 2 === 0).join('; ') : '');
    else {
      const t = e.tiles || [];
      const views = t.slice(0, 6).map(x => x.split(' · ').pop()).join(', ');
      what = (e.id ? '`' + e.id + '`' + (e.name ? ' «' + e.name + '»' : '') + (e.slot ? ' (' + e.slot + ')' : '') : (e.what || '')) + ' · ' + e.venue + ' · ' + t.length + ' casillas' +
        (t.length ? ' [' + views + (t.length > 6 ? ' …' : '') + ']' : '') + (e.lods && e.lods.length ? ' · ' + e.lods.join(' / ') : '') +
        (e.removed && e.removed.length ? ' · **QUITADO: ' + e.removed.join('; ') + '**' : '');
    }
    L.push('- `' + f + '` — ' + what);
  }
  L.push('');
}
fs.writeFileSync(path.join(OUT, 'INDEX.md'), L.join('\n'));
console.log('INDEX.md: ' + files.length + ' hojas');
