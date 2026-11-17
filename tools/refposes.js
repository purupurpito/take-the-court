#!/usr/bin/env node
/* MAKE THE CUT — tools/refposes.js  (owner: arena)
 * Capturas de las SEÑALES OFICIALES de los árbitros (ARN-07) y del 2º árbitro en su sitio, para revisar las poses a ojo.
 * Abre una escena congelada (?debug=serve: dt de juego 0, así la secuencia del árbitro se queda en el paso que se elija),
 * lanza cada señal con el gancho de depuración VB.Arena._dbg().refSignal(e, g) y fija el paso (seqI) de la seña; luego
 * coloca la cámara (primer plano del 1r árbitro, plano de TV desde el otro lado o la cámara del juego) y captura.
 * Uso: node tools/refposes.js [carpeta=tools/out/refposes] [señales=all|in,out,…] [vistas=near,hand,front,tv,game,r2,r2wide] [WxH=1280x720] [query extra]
 *   p. ej. node tools/refposes.js tools/out/refposes four,delay8 near
 *          node tools/refposes.js tools/out/refposes-beach all near,r2 1280x720 map=beach
 * Vistas: near = 1r árbitro de cerca, ladeado · hand = de frente, pegado a la red (manos y dedos) · front = de frente desde el
 * otro lado de la red · tv = desde la grada de enfrente (~19 m) · game = la cámara del juego tal cual · r2 = 2º árbitro de cerca
 * (sus señas) · r2wide = su sitio respecto al poste.
 * Variables: POSES='{"fingers":[x,z,y,e,t]}' o una lista de objetos (variantes -v0, -v1…) cambia POSE en caliente;
 * CLIP=x,y,w,h[,escala] recorta la captura.
 */
'use strict';
const path = require('path'), fs = require('fs');
const CDP = require('./cdp.js');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'out', 'refposes'));
const SIGS = process.argv[3] || 'all', VIEWS = (process.argv[4] || 'near,tv,game').split(','), SIZE = process.argv[5] || '1280x720';
const EXTRA = process.argv[6] || '';
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.error('TIEMPO AGOTADO'); process.exit(2); }, 600000).unref();

// [nombre, evento falso de point (o caso especial), paso (seqI) a capturar en R1, paso en R2 (o -1)]
// e.team = equipo que gana el punto (saca después); el que pierde comete la falta. landSide 0 = campo x > 0.
const CASES = [
  ['auth0', { kind: 'auth', team: 0 }],
  ['auth0b', { kind: 'auth', team: 0 }, 2],
  ['auth1', { kind: 'auth', team: 1 }],
  ['team0', { type: 'point', team: 0, reason: 'out', signal: 'out', landSide: 1 }, 1],
  ['team1', { type: 'point', team: 1, reason: 'out', signal: 'out', landSide: 0 }, 1],
  ['in', { type: 'point', team: 0, reason: 'in', signal: 'in', landSide: 1 }, 2],
  ['out', { type: 'point', team: 0, reason: 'out', signal: 'out', landSide: 1 }, 2],
  ['touched', { type: 'point', team: 1, reason: 'out', signal: 'touched', landSide: 0 }, 2],
  ['four', { type: 'point', team: 1, reason: 'four', signal: 'four', pl: 0 }, 2],
  ['double', { type: 'point', team: 0, reason: 'double', signal: 'double', pl: 1 }, 2],
  ['net', { type: 'point', team: 1, reason: 'net', signal: 'net', pl: 0 }, -1, 2],
  ['under', { type: 'point', team: 0, reason: 'under', signal: 'under' }, -1, 2],
  ['antenna', { type: 'point', team: 0, reason: 'antenna', signal: 'antenna', antenna: [0, 4.5, 2.6] }, 2],
  ['attack', { type: 'point', team: 1, reason: 'attackServe', signal: 'attackFault', pl: 0 }, 2],
  ['block', { type: 'point', team: 0, reason: 'block', signal: 'attackFault', pl: 1 }, 2],
  ['position', { type: 'point', team: 1, reason: 'position', signal: 'attackFault', pl: 0, sideout: false }, -1, 2],
  ['delay8', { type: 'point', team: 1, reason: 'serve', signal: 'delay8', pl: 0 }, 2],
  ['serveFault', { type: 'point', team: 0, reason: 'serve', signal: 'serveFault', pl: 1 }, 2],
  ['setEnd', { type: 'point', team: 0, reason: 'in', signal: 'in', landSide: 1, setWon: true }, 3],
  ['challenge', { kind: 'challenge' }, 1],
  ['team0r2', { type: 'point', team: 0, reason: 'net', signal: 'net', pl: 1 }, -2, -2]
];
const pick = SIGS === 'all' ? CASES : CASES.filter(c => SIGS.split(',').indexOf(c[0]) >= 0);

// Cámara (coordenadas de sim; three = (x, z, -y)). R1: silla en y = -(HW + 1,62), cabeza a ~3 m. R2 se lee de la página.
const VIEW = {
  near: 'var R=d.R1.sim; cam(3.4, R.y + 3.4, 3.0, 0, R.y, 2.35, 30);',
  hand: 'var R=d.R1.sim; cam(-0.55, R.y + 4.2, 3.15, 0, R.y, 2.7, 26);',
  front: 'var R=d.R1.sim; cam(-2.8, R.y + 7.2, 3.5, 0, R.y, 2.6, 24);',
  tv: 'var R=d.R1.sim; cam(-1.5, 12.5, 5.2, 0, R.y, 2.2, 22);',
  game: '',
  r2: 'var R=d.R2.sim, sg=R.x<0?-1:1; cam(R.x + sg * 1.4, R.y - 3.4, 1.7, R.x, R.y, 1.15, 34);',
  // vista amplia del 2º árbitro: su sitio respecto al poste y la red (desde la grada de enfrente, alto)
  r2wide: 'var R=d.R2.sim; cam(0, -9.5, 6.5, 0, R.y, 0.8, 26);'
};

(async () => {
  let page, code = 0;
  try {
    page = await CDP.open({ size: SIZE });
    await page.navigate('debug=serve&seed=3' + (EXTRA ? '&' + EXTRA : '')); await CDP.sleep(5500);
    // fuera la interfaz (solo el lienzo) y gancho de cámara: tras CameraRig.update, si window.__cam está puesto, manda él
    await page.evalJs(`(function(){
      VB.ctx.frozen=true; // tiempo de juego parado: la secuencia del árbitro se queda en el paso elegido
      var st=document.createElement('style'); st.textContent='body *{visibility:hidden!important} canvas{visibility:visible!important}'; document.head.appendChild(st);
      var CR=VB.CameraRig, up=CR.update;
      CR.update=function(){ var r=up.apply(this,arguments); var c=window.__cam, cm=VB.ctx.camera; if(c){ cm.position.set(c[0],c[2],-c[1]); cm.up.set(0,1,0); cm.lookAt(c[3],c[5],-c[4]); cm.fov=c[6]; cm.updateProjectionMatrix(); cm.updateMatrixWorld(true);} return r; };
      window.cam=function(x,y,z,tx,ty,tz,fov){ window.__cam=[x,y,z,tx,ty,tz,fov]; };
      return 1; })()`);
    // POSES='{"fingers":[x,z,y,e,t],…}' cambia poses de VB.Arena POSE en caliente (para afinar sin recargar)
    //   (una lista de objetos = variantes: las capturas llevan el sufijo -v0, -v1…)
    let VARS = process.env.POSES ? JSON.parse(process.env.POSES) : [null];
    const multi = !!process.env.POSES && Array.isArray(VARS); if (!Array.isArray(VARS)) VARS = [VARS];
    for (let vi = 0; vi < VARS.length; vi++) {
    if (VARS[vi]) await page.evalJs(`(function(){ var P=VB.Arena._dbg().POSE, o=${JSON.stringify(VARS[vi])}; for (var k in o) { if (!P[k]) P[k]=[0,0,0,0,0]; for (var i=0;i<5;i++) P[k][i]=o[k][i]; } return 1; })()`);
    const suf = multi ? '-v' + vi : '';
    for (const c of pick) {
      const [name, ev, i1, i2] = c;
      const run = `(function(){ var d=VB.Arena._dbg(), g=VB.ctx.game, e=${JSON.stringify(ev)};
        d.R1.seq=null; d.R2.seq=null; d.R1.sig=''; d.R2.sig='';
        if (e.pl!=null) { e.player = { x: e.pl === 0 ? 3 : -3, team: e.pl }; }
        if (e.kind==='auth') d.refAuthorize(e.team); else if (e.kind==='challenge') d.refChallenge(); else d.refSignal(e, g);
        var R1=d.R1, R2=d.R2;
        function at(P, i){ if (!P.seq) return; if (i===-2) i=P.seq.length-1; if (i<0||i>=P.seq.length) return; P.seqI=i; P.seqT=Math.min(0.35, P.seq[i].d*0.4); }
        at(R1, ${i1 == null ? 1 : i1}); at(R2, ${i2 == null ? -1 : i2});
        return (R1.seq?R1.seq.length:0)+' / '+(R2.seq?R2.seq.length:0)+' sig '+R1.sig+'|'+(R2.sig||''); })()`;
      const info = await page.evalJs(run);
      for (const v of VIEWS) {
        await page.evalJs(v === 'game' ? 'window.__cam=null' : `(function(){ var d=VB.Arena._dbg(); function cam(x,y,z,tx,ty,tz,f){ window.cam(x,y,z,tx,ty,tz,f); } ${VIEW[v]} return 1; })()`);
        await CDP.sleep(v === VIEWS[0] ? 1100 : 350);
        const f = path.join(OUT, name + '-' + v + suf + '.png');
        // CLIP=x,y,w,h[,escala] recorta (y reduce) la captura: hojas de revisión más ligeras
        const cl = process.env.CLIP ? process.env.CLIP.split(',').map(Number) : null;
        await page.shot(f, cl ? { x: cl[0], y: cl[1], width: cl[2], height: cl[3], scale: cl[4] || 1 } : undefined);
        console.log(name, v, info, '->', f);
      }
    }
    }
    if (page.errors.length) { console.error('ERRORES EN LA PÁGINA:\n' + page.errors.slice(0, 10).join('\n')); code = 1; }
  } catch (e) { console.error(e && e.stack || e); code = 1; }
  if (page) page.close();
  process.exit(code);
})();
