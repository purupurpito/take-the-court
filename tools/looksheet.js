#!/usr/bin/env node
/* MAKE THE CUT — tools/looksheet.js (auditoría del Vestuario): hojas de contacto de las capturas de tools/lookaudit.js.
 * Recorta la mitad derecha de cada captura (el muñeco) y las junta en rejillas, con un solo Chrome (canvas en una página en blanco).
 * Uso: node tools/looksheet.js [carpeta=tools/out/lookaudit]
 */
'use strict';
const path = require('path'), fs = require('fs');
const CDP = require('./cdp.js');
const DIR = path.resolve(process.argv[2] || path.join(CDP.ROOT, 'tools', 'out', 'lookaudit'));
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 5 * 60e3).unref();
const all = fs.readdirSync(DIR).filter(f => /\.png$/.test(f) && !/^sheet-/.test(f)).sort();
const styles = ['tupe', 'coleta', 'afro', 'flequillo', 'rapado', 'mono', 'trenzas', 'dosmonos', 'coletas', 'cresta'];
const S = [];
const st = []; styles.forEach(s => ['front', 'side', 'back'].forEach(v => st.push('style-' + s + '-' + v + '.png')));
S.push(['styles1', st.slice(0, 15), 3, [330, 0, 310, 360]]);
S.push(['styles2', st.slice(15), 3, [330, 0, 310, 360]]);
S.push(['heads', all.filter(f => /^head-/.test(f)), 3, [330, 0, 310, 360]]);
S.push(['combos', all.filter(f => /^combo-/.test(f)), 4, [330, 0, 310, 360]]);
S.push(['face', all.filter(f => /^(eyes|face)-/.test(f)), 4, [330, 0, 310, 360]]);
S.push(['arms', all.filter(f => /^(arms|body)-/.test(f)), 2, [300, 0, 340, 360]]);
S.push(['legs', all.filter(f => /^legs-/.test(f)), 2, [300, 0, 340, 360]]);

(async () => {
  const page = await CDP.open({ size: '800x600' });
  try {
    await page.send('Page.navigate', { url: 'about:blank' }); await CDP.sleep(500);
    for (const [name, files, cols, cr] of S) {
      if (!files.length) continue;
      const imgs = files.map(f => 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64'));
      const data = await page.evalJs(`(async function(){
        var srcs = ${JSON.stringify(imgs)}, names = ${JSON.stringify(files)}, cols = ${cols}, cr = ${JSON.stringify(cr)};
        var ims = await Promise.all(srcs.map(function (s) { return new Promise(function (r) { var i = new Image(); i.onload = function () { r(i); }; i.src = s; }); }));
        var w = cr[2], h = cr[3], rows = Math.ceil(ims.length / cols), c = document.createElement('canvas'); c.width = w * cols; c.height = h * rows;
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.font = 'bold 13px sans-serif';
        ims.forEach(function (im, k) { var x = (k % cols) * w, y = Math.floor(k / cols) * h; g.drawImage(im, cr[0], cr[1], w, h, x, y, w, h);
          g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(x, y + h - 18, w, 18); g.fillStyle = '#fff'; g.fillText(names[k].replace('.png', ''), x + 4, y + h - 5);
          g.strokeStyle = '#000'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); });
        return c.toDataURL('image/png').split(',')[1]; })()`, true);
      const f = path.join(DIR, 'sheet-' + name + '.png'); fs.writeFileSync(f, Buffer.from(data, 'base64')); console.log('→ ' + f);
    }
  } catch (e) { console.error('ERROR:', e && e.stack || e); }
  page.close();
})();
