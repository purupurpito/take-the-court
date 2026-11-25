#!/usr/bin/env node
/* TAKE THE COURT — tools/refshots.js  (owner: arena)
 * Capturas del ASPECTO del 1r árbitro (24-nov-2026): el de fuera de la Carrera (pista: larguirucho con poco pelo; playa: calvo, a
 * veces con gorra) y los de la Carrera por carácter (VB.Arbitro.look con varias semillas). Escena congelada ?debug=serve, cámara de
 * cerca al 1r (cara y cuerpo) y VB.Arena._dbg().refLook(spec) para cada variante.
 * Uso: node tools/refshots.js [carpeta=tools/out/refshots] [WxH=844x390] [map=beach|hall]
 */
'use strict';
const path = require('path'), fs = require('fs');
const CDP = require('./cdp.js');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'out', 'refshots'));
const SIZE = process.argv[3] || '844x390', MAP = process.argv[4] || 'hall';
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 300000).unref();

const VARS = [['rapido-s3', { quick: true, seed: 3 }], ['rapido-s4', { quick: true, seed: 4 }], ['rapido-s7', { quick: true, seed: 7 }]];
const TR = ['estricto', 'deja', 'lince', 'nervioso', 'manual'], STY = ['es', 'it', 'br', 'jp', 'de'];
TR.forEach((t, i) => { for (let k = 0; k < 2; k++) VARS.push(['carrera-' + t + '-' + k, { trait: t, lk: 1000 + i * 77 + k * 31337, id: 'X-' + k, sty: STY[(i + k) % STY.length] }]); });

(async () => {
  let page, code = 0;
  try {
    page = await CDP.open({ size: SIZE });
    await page.navigate('debug=serve&seed=3' + (MAP === 'beach' ? '&map=beach' : '')); await CDP.sleep(5500);
    await page.evalJs(`(function(){
      VB.ctx.frozen=true;
      var st=document.createElement('style'); st.textContent='body *{visibility:hidden!important} canvas{visibility:visible!important}'; document.head.appendChild(st);
      var CR=VB.CameraRig, up=CR.update;
      CR.update=function(){ var r=up.apply(this,arguments); var c=window.__cam, cm=VB.ctx.camera; if(c){ cm.position.set(c[0],c[2],-c[1]); cm.up.set(0,1,0); cm.lookAt(c[3],c[5],-c[4]); cm.fov=c[6]; cm.updateProjectionMatrix(); cm.updateMatrixWorld(true);} return r; };
      return 1; })()`);
    for (const [name, spec] of VARS) {
      const info = await page.evalJs(`(function(){ var d=VB.Arena._dbg(), L=d.refLook(${JSON.stringify(spec)}), H=new THREE.Vector3();
        d.R1.root.updateMatrixWorld(true); d.R1.head.getWorldPosition(H);
        var sx=H.x, sy=-H.z, sz=H.y; window.__cam=[sx + 1.5, sy + 2.6, sz + 0.25, sx, sy, sz - 0.4, 34];
        return JSON.stringify(L); })()`);
      await CDP.sleep(700);
      const f = path.join(OUT, MAP + '-' + name + '.png');
      await page.shot(f);
      console.log(name, info, '->', f);
    }
    await page.evalJs('VB.Arena._dbg().refLook(null)');
    if (page.errors.length) { console.error('ERRORES EN LA PÁGINA:\n' + page.errors.slice(0, 10).join('\n')); code = 1; }
  } catch (e) { console.error(e && e.stack || e); code = 1; }
  if (page) page.close();
  process.exit(code);
})();
