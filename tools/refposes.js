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
 * (sus señas) · r2wide = su sitio respecto al poste · lj4 = la pista entera desde arriba (qué juez de línea señala) · lj = el juez
 * que señala, de cerca.
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
// pl = equipo del jugador infractor (x = ±3, y = py); pls = [[x, y], …] jugadores solapados (e.players); land = [x, y] bote
// (g.lastLand: el 1r mira al juez de esa zona); glt = [g.lastTeam, g.lastKind] (quién atacaba: decide quién pita la red).
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
  ['net', { type: 'point', team: 1, reason: 'net', signal: 'net', pl: 0, glt: [1, 'spike'] }, -1, 2],
  ['netPt', { type: 'point', team: 1, reason: 'net', signal: 'net', pl: 0, py: 1.2, glt: [1, 'spike'] }, -1, 3],
  ['netR1', { type: 'point', team: 1, reason: 'net', signal: 'net', pl: 0, py: -1.5, glt: [0, 'spike'] }, 2],
  ['netR1pt', { type: 'point', team: 1, reason: 'net', signal: 'net', pl: 0, py: -1.5, glt: [0, 'spike'] }, 3],
  ['netBall', { type: 'point', team: 0, reason: 'out', signal: 'netBall', faultTeam: 1, lastKind: 'serve' }, 2],
  // remate a la red que sale fuera en su campo (Guidelines 28.11.4): «fuera» y señalar al atacante (el único 'out' con faultTeam)
  ['netOutPt', { type: 'point', team: 1, reason: 'out', signal: 'out', landSide: 0, faultTeam: 0, lastKind: 'spike', pl: 0, py: -2 }, 3],
  ['doublePt', { type: 'point', team: 0, reason: 'double', signal: 'double', pl: 1, py: -1 }, 3],
  ['inLook', { type: 'point', team: 0, reason: 'in', signal: 'in', landSide: 1, land: [-8.8, 2.5] }, 1],
  ['outLook', { type: 'point', team: 1, reason: 'out', signal: 'out', landSide: 0, land: [4.0, -4.7] }, 1],
  ['under', { type: 'point', team: 0, reason: 'under', signal: 'under' }, 2],   // balón por debajo de la red: el 1r (23.3.2.3f)
  ['antenna', { type: 'point', team: 0, reason: 'antenna', signal: 'antenna', antenna: [0, -4.5, 2.6] }, 2],
  ['antennaR2', { type: 'point', team: 0, reason: 'antenna', signal: 'antenna', antenna: [0, 4.5, 2.6] }, -1, 2],
  ['attack', { type: 'point', team: 1, reason: 'attackServe', signal: 'attackFault', pl: 0 }, 2],
  ['block', { type: 'point', team: 0, reason: 'block', signal: 'attackFault', pl: 1 }, 2],
  ['position', { type: 'point', team: 1, reason: 'position', signal: 'attackFault', pl: 0, sideout: false }, -1, 2],
  ['positionR2', { type: 'point', team: 1, reason: 'position', signal: 'attackFault', pl: 0, pls: [[2.2, -2.6], [4.6, -2.2]] }, 0, 3],
  ['positionR2b', { type: 'point', team: 1, reason: 'position', signal: 'attackFault', pl: 0, pls: [[2.2, -2.6], [4.6, -2.2]] }, 0, 4],
  ['positionR1', { type: 'point', team: 1, reason: 'position', signal: 'attackFault', pl: 0, pls: [[2.2, -2.6], [4.6, -2.2]] }, 0, -1],
  ['delay8', { type: 'point', team: 1, reason: 'serve', signal: 'delay8', pl: 0 }, 2],
  ['delay5', { type: 'point', team: 1, reason: 'serve', signal: 'delay5', pl: 0 }, 2],
  ['serveFault', { type: 'point', team: 0, reason: 'serve', signal: 'serveFault', pl: 1 }, 2],
  ['setEnd', { type: 'point', team: 0, reason: 'in', signal: 'in', landSide: 1, setWon: true }, -2],
  ['challenge', { kind: 'challenge' }, 1],
  ['team0r2', { type: 'point', team: 0, reason: 'net', signal: 'net', pl: 1, glt: [0, 'spike'] }, -2, -2],
  ['setEndChal', { kind: 'chalEnd' }, 2],
  // eventos de verdad por onEvents (ev): cambio de campo (pista: el 1r tras la X o tras el punto; playa: el 2º), sustitución y
  // tiempo muerto (el 2º), y jueces de línea (solo el de la línea del bote, si está cerca; antena: el de la lateral)
  ['ccSet', { ev: [{ type: 'point', team: 0, reason: 'in', signal: 'in', landSide: 1, setWon: true }, { type: 'courtChange', why: 'set', setNo: 1 }] }, -2],
  ['ccEight', { ev: [{ type: 'point', team: 1, reason: 'out', signal: 'out', landSide: 0 }, { type: 'courtChange', why: 'eight', setNo: 3 }] }, -2],
  ['ccSwap', { ev: [{ type: 'point', team: 1, reason: 'out', signal: 'out', landSide: 0 }, { type: 'courtChange', why: 'swap', setNo: 1, every: 7 }] }, -2, -2],
  ['sub', { ev: [{ type: 'sub', team: 0 }, { type: 'sub', team: 1 }] }, -1, 0],
  ['timeout0', { ev: [{ type: 'timeout', team: 0 }] }, -1, 1],
  ['timeout0b', { ev: [{ type: 'timeout', team: 0 }] }, -1, 2],
  ['timeout1b', { ev: [{ type: 'timeout', team: 1 }] }, -1, 2],
  ['ljEndIn', { ev: [{ type: 'land', x: 8.4, y: 1.0, inside: true }] }, -1],
  ['ljEndOut', { ev: [{ type: 'land', x: -9.6, y: -2.0, inside: false }] }, -1],
  ['ljSideOut', { ev: [{ type: 'land', x: 3.0, y: 5.2, inside: false }] }, -1],
  ['ljSideIn', { ev: [{ type: 'land', x: -5.0, y: -3.8, inside: true }] }, -1],
  ['ljMid', { ev: [{ type: 'land', x: 4.0, y: 0.5, inside: true }] }, -1],
  ['ljAnt', { ev: [{ type: 'point', team: 0, reason: 'antenna', signal: 'antenna', antenna: [0, -4.5, 2.6] }] }, -1],
  ['ljAntR2', { ev: [{ type: 'point', team: 0, reason: 'antenna', signal: 'antenna', antenna: [0, 4.5, 2.6] }] }, -1]
];
const pick = SIGS === 'all' ? CASES : CASES.filter(c => SIGS.split(',').indexOf(c[0]) >= 0);

// Cámara (coordenadas de sim; three = (x, z, -y)). R1: silla en y = -(HW + 1,62), cabeza a ~3 m. R2 se lee de la página.
const VIEW = {
  near: 'var R=d.R1.sim; cam(3.4, R.y + 3.4, 3.0, 0, R.y, 2.35, 30);',
  hand: 'var R=d.R1.sim; cam(-0.55, R.y + 4.2, 3.15, 0, R.y, 2.7, 26);',
  front: 'var R=d.R1.sim; cam(-2.8, R.y + 7.2, 3.5, 0, R.y, 2.6, 24);',
  // las manos del 1r de cerca y desde su derecha, sin el poste delante (contar dedos: pulgar incluido)
  fing: 'var R=d.R1.sim; cam(1.5, R.y + 3.0, 3.0, 0.15, R.y, 2.75, 20);',
  tv: 'var R=d.R1.sim; cam(-1.5, 12.5, 5.2, 0, R.y, 2.2, 22);',
  game: '',
  r2: 'var R=d.R2.sim, sg=R.x<0?-1:1; cam(R.x + sg * 1.4, R.y - 3.4, 1.7, R.x, R.y, 1.15, 34);',
  // vista amplia del 2º árbitro: su sitio respecto al poste y la red (desde la grada de enfrente, alto)
  r2wide: 'var R=d.R2.sim; cam(0, -9.5, 6.5, 0, R.y, 0.8, 26);',
  // jueces de línea: toda la pista desde arriba (quién señala) y de cerca el que señala (o el de la esquina +x/-y si no hay)
  lj4: 'cam(0, -15, 17, 0, 0.5, 0, 52);',
  lj: 'var J=d.judges.filter(function(q){return q.seq;})[0]||d.judges[0], R=J.sim, n=Math.hypot(R.x,R.y)||1; cam(R.x*0.8 - R.y/n*3.4, R.y*0.8 + R.x/n*3.4, 2.2, R.x, R.y, 1.4, 34);'
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
        d.R1.seq=null; d.R2.seq=null; d.R1.sig=''; d.R2.sig=''; d.judges.forEach(function(J){ J.seq=null; J.sig=''; });
        if (e.pl!=null) { e.player = { x: e.pl === 0 ? 3 : -3, y: e.py || 0, z: 0, team: e.pl }; e.faultPlayer = e.player; }
        if (e.pls) e.players = e.pls.map(function (q) { return { x: q[0], y: q[1], z: 0, team: e.pl }; });
        if (e.land) g.lastLand = { x: e.land[0], y: e.land[1], inside: e.reason === 'in', t: g.time };
        if (e.glt) { g.lastTeam = e.glt[0]; g.lastKind = e.glt[1]; }
        if (e.kind==='auth') d.refAuthorize(e.team, g.server);
        else if (e.kind==='chalEnd') { d.refSignal({ type: 'point', team: 0, reason: 'in', signal: 'in', landSide: 1, setWon: true }, g); d.refChallengeResult(0, true, -3, true); } else if (e.kind==='challenge') d.refChallenge(); else if (e.ev) d.onEvents(g, e.ev); else d.refSignal(e, g);
        var R1=d.R1, R2=d.R2;
        // pita el 2º: en la escena congelada no le da tiempo a cruzar; se le pone ya del lado del infractor (R2S[6]), desde donde
        // señala en el partido (Guidelines 28.9: nunca a través de la red)
        if (!e.ev && !e.kind && R2.seq) { var dx = d.R2S[6] * 0.8 - R2.sim.x; R2.sim.x += dx; R2.root.position.x += dx; }
        function at(P, i){ if (!P.seq) return; if (i===-2) i=P.seq.length-1; if (i<0||i>=P.seq.length) return; P.seqI=i; P.seqT=Math.min(0.35, P.seq[i].d*0.4); }
        at(R1, ${i1 == null ? 1 : i1}); at(R2, ${i2 == null ? -1 : i2});
        var js=d.judges.filter(function(J){ at(J, 0); return J.seq; }).map(function(J){ return J.lines.join(':')+'='+J.sig; }).join(',');
        return (R1.seq?R1.seq.length:0)+' / '+(R2.seq?R2.seq.length:0)+' sig '+R1.sig+'|'+(R2.sig||'')+' jueces '+(js||'-'); })()`;
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
