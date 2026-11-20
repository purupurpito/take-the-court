#!/usr/bin/env node
/* TAKE THE COURT — tools/vestuxsheet.js: junta capturas en una hoja (recorte de la zona del muñeco) para mirarlas de una vez.
 * Uso: node tools/vestuxsheet.js <carpeta> <salida.png> [x,y,w,h recorte en px de la captura] [columnas=5]
 */
'use strict';
const path = require('path'), fs = require('fs');
const CDP = require('./cdp.js');
const dir = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const [cx, cy, cw, ch] = (process.argv[4] || '380,80,260,280').split(',').map(Number), cols = +(process.argv[5] || 5);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
const cells = files.map(f => `<figure><div style="width:${cw}px;height:${ch}px;background:url('${('file:///' + path.join(dir, f)).replace(/\\/g, '/')}') -${cx}px -${cy}px no-repeat"></div><figcaption>${f}</figcaption></figure>`).join('');
const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#222;color:#eee;font:12px sans-serif;display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:6px;padding:6px}figure{margin:0}</style>${cells}`;
const tmp = path.join(path.dirname(out), '_sheet.html'); fs.writeFileSync(tmp, html);
(async () => {
  const rows = Math.ceil(files.length / cols), W = cols * (cw + 6) + 6, H = rows * (ch + 26) + 6;
  const page = await CDP.open({ size: W + 'x' + H });
  await page.send('Page.navigate', { url: 'file:///' + tmp.replace(/\\/g, '/') }); await CDP.sleep(1500);
  await page.shot(out); await page.close(); fs.unlinkSync(tmp); console.log(out); process.exit(0);
})();
