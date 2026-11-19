#!/usr/bin/env node
/* MAKE THE CUT — tools/lookzoom.js (auditoría del Vestuario): capturas de cerca de la cabeza en la vista previa (1 Chrome).
 * Uso: node tools/lookzoom.js [estilos=rapado,tupe,flequillo,cresta] [W=1280] [H=720]   → tools/out/lookaudit/zoom-*.png */
'use strict';
const path = require('path'), CDP = require('./cdp.js');
const styles = (process.argv[2] || 'rapado,tupe,flequillo,cresta').split(','), W = +(process.argv[3] || 1280), H = +(process.argv[4] || 720);
const OUT = path.join(CDP.ROOT, 'tools', 'out', 'lookaudit');
setTimeout(() => process.exit(2), 5 * 60e3).unref();
(async () => {
  const page = await CDP.open({ size: W + 'x' + H });
  try {
    await page.navigate('debug=look&tab=pelo&venue=pista&quality=high'); await CDP.sleep(4500);
    for (const s of styles) for (const [tag, yaw] of [['f', 0], ['q', 0.6], ['s', Math.PI / 2]]) {
      await page.evalJs(`(function(){ var f = JSON.parse(JSON.stringify(VB.Look.defaults(0))); f.style = '${s}'; f.hair = 0xe0c070;
        VB.Doll.preview.set(VB.Look.resolve(f, 'hall', VB.Players.kit(0)), { beach: false }); VB.Doll.preview.yaw(${yaw}); VB.Doll.preview.face('neutra'); })()`);
      await CDP.sleep(900);
      await page.shot(path.join(OUT, 'zoom-' + s + '-' + tag + '.png'), { x: W * 0.55, y: 0, width: W * 0.45, height: H * 0.75, scale: 1 });
    }
  } catch (e) { console.error(e); }
  page.close();
})();
